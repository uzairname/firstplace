import * as D from 'discord-api-types/v10'
import { type InferInsertModel, eq, and } from 'drizzle-orm'
import { Guild, GuildRanking, Match, Ranking } from '../../../database/models'
import { MatchSummaryMessages } from '../../../database/schema'
import { GuildChannelData, MessageData } from '../../../discord-framework'
import { sentry } from '../../../request/sentry'
import { nonNullable } from '../../../utils/utils'
import { App } from '../../app/app'
import { Colors, escapeMd } from '../../messages/message_pieces'
import { communityEnabled, syncRankedCategory } from '../guilds'
import { calculateMatchNewRatings, getAndCalculateMatchNewRatings } from './score_matches'
import { getNewRatings } from './scoring'

export function addMatchSummaryMessagesListeners(app: App): void {
  app.events.MatchScored.on(async data => {
    await syncMatchSummaryMessages(app, data)
  })

  app.events.GuildRankingCreated.on(async guild_ranking => {
    await syncMatchSummaryChannel(app, guild_ranking)
  })
}

/**
 * Sync match summary messages for this match in all guilds
 * @param app
 * @param match
 * @param players
 */
async function syncMatchSummaryMessages(app: App, match: Match): Promise<void> {
  const guild_rankings = await app.db.guild_rankings.get({ ranking_id: match.data.ranking_id })

  await Promise.all(
    guild_rankings.map(async guild_ranking => {
      await syncMatchSummaryMessageInGuild(app, match, guild_ranking.guild_ranking)
    }),
  )
}

async function syncMatchSummaryMessageInGuild(
  app: App,
  match: Match,
  guild_ranking: GuildRanking,
): Promise<void> {
  // update the match summary message on Discord

  const existing_message = (
    await app.db.db
      .select()
      .from(MatchSummaryMessages)
      .where(
        and(
          eq(MatchSummaryMessages.match_id, match.data.id),
          eq(MatchSummaryMessages.guild_id, guild_ranking.data.guild_id),
        ),
      )
  )[0]

  sentry.debug(`syncing match summary message for guild ranking`)
  const is_forum = await communityEnabled(app, guild_ranking.data.guild_id)
  const guild = await guild_ranking.guild()
  const ranking = await guild_ranking.ranking()

  if (is_forum) {
    const result = await app.bot.utils.syncForumPost({
      target_thread_id: existing_message?.forum_thread_id,
      target_message_id: existing_message?.message_id,
      new_post: async () => {
        return {
          // default to the guild's match results forum if the guild ranking doesn't have one
          target_forum_id:
            guild_ranking.data.match_results_forum_id ?? guild.data.match_results_forum_id,
          body: {
            name: `Match #${match.data.number} in ${ranking.data.name}`,
            message: (await matchSummaryMessageData(match)).postdata,
          },
        }
      },
      update_message: async () => (await matchSummaryMessageData(match)).patchdata,
      new_forum: async () =>
        matchSummaryChannelData(app, await guild_ranking.guild(), ranking, true),
    })

    // update the match summary message in database
    let update: Partial<InferInsertModel<typeof MatchSummaryMessages>> = {}
    if (result.new_post) {
      // there is never a new message without a new post
      // TODO update or insert match summary messae
      // update.message_id = result.message.id
      // update.forum_thread_id = result.thread_id
      // await app.db.db.update(MatchSummaryMessages).set(update)
    }

    // If a new forum was created, set it to the guild's default match results forum
    result.new_forum && (await guild.update({ match_results_forum_id: result.new_forum.id }))
  } else {
    const result = await app.bot.utils.syncChannelMessage({
      // default to the guild's match results text channel if the guild ranking doesn't have one
      target_channel_id:
        guild_ranking.data.match_results_textchannel_id ?? guild.data.match_results_textchannel_id,
      target_message_id: existing_message?.message_id,
      messageData: async () => matchSummaryMessageData(match),
      channelData: async () => matchSummaryChannelData(app, guild, ranking, false),
    })

    // update the match summary message in database
    let update: Partial<InferInsertModel<typeof MatchSummaryMessages>> = {}
    result.is_new_message && (update.message_id = result.message.id)
    if (Object.keys(update).length > 0) {
      // unset the forum thread id
      // TODO update or insert match summary messae
      // await app.db.db.update(MatchSummaryMessages).set({ ...update, forum_thread_id: null })
    }
    result.new_channel &&
      (await guild.update({
        match_results_textchannel_id: result.new_channel.id,
      }))
  }
}

export async function syncMatchSummaryChannel(
  app: App,
  guild_ranking: GuildRanking,
  for_guild_ranking: boolean = false,
): Promise<void> {
  const is_forum = await communityEnabled(app, guild_ranking.data.guild_id)
  const guild = await guild_ranking.guild()
  const ranking = await guild_ranking.ranking()

  const result = await app.bot.utils.syncGuildChannel({
    target_channel_id: is_forum
      ? for_guild_ranking
        ? guild_ranking.data.match_results_forum_id
        : guild.data.match_results_forum_id
      : for_guild_ranking
        ? guild_ranking.data.match_results_textchannel_id
        : guild.data.match_results_textchannel_id,
    channelData: async () =>
      await matchSummaryChannelData(app, guild, ranking, is_forum, for_guild_ranking),
  })

  if (result.is_new_channel) {
    if (is_forum) {
      if (for_guild_ranking) {
        await guild_ranking.update({ match_results_forum_id: result.channel.id })
      } else {
        await guild.update({ match_results_forum_id: result.channel.id })
      }
    } else {
      if (for_guild_ranking) {
        await guild_ranking.update({ match_results_textchannel_id: result.channel.id })
      } else {
        await guild.update({ match_results_textchannel_id: result.channel.id })
      }
    }
  }
}

export async function matchSummaryMessageData(match: Match): Promise<MessageData> {
  const ranking = await match.ranking()
  const num_teams = nonNullable(ranking.data.num_teams)
  const players = await match.players()
  const player_ratings = await getAndCalculateMatchNewRatings(match, ranking)

  const embed: D.APIEmbed = {
    title: `Match #${match.data.number} in ${escapeMd(ranking.data.name)}`,
    fields: new Array(num_teams).fill(0).map((_, i) => {
      return {
        name: `Team ${i + 1}`,
        value: players[i]
          .map((p, j) => {
            return `<@${p.player.data.user_id}> (${player_ratings[i][j].rating_before.toFixed(
              0,
            )} → **${player_ratings[i][j].rating_after.toFixed(0)}**)`
          })
          .join('\n'),
        inline: true,
      }
    }),
    color: Colors.EmbedBackground,
  }

  return new MessageData({
    content: `Match finished: ${players
      .map(team => team.map(p => p.player.data.name).join(', '))
      .join(' vs. ')}`,
    embeds: [embed],
  })
}

/**
 * Data for a new match summary forum channel
 */
export async function matchSummaryChannelData(
  app: App,
  guild: Guild,
  ranking: Ranking,
  forum?: boolean,
  is_ranking_specific?: boolean,
): Promise<{
  guild_id: string
  data: GuildChannelData
}> {
  let category = (await syncRankedCategory(app, guild)).channel
  return {
    guild_id: guild.data.id,
    data: new GuildChannelData({
      type: forum ? D.ChannelType.GuildForum : D.ChannelType.GuildText,
      parent_id: category.id,
      name: (is_ranking_specific ? `${ranking.data.name}` : ``) + ` Match Log`,
      topic:
        `Ranked matches` +
        (is_ranking_specific ? ` in ${ranking.data.name}` : ` in this server`) +
        ` are recorded here`,
      permission_overwrites: matchSummaryChannelPermissionOverwrites(
        guild.data.id,
        app.bot.application_id,
      ),
      default_sort_order: D.SortOrderType.CreationDate,
      default_reaction_emoji: { emoji_name: '👍', emoji_id: null },
      available_tags: [{ name: 'match', emoji_name: '⭐' }],
      default_forum_layout: D.ForumLayoutType.ListView,
    }),
  }
}

export function matchSummaryChannelPermissionOverwrites(
  guild_id: string,
  application_id: string,
): D.APIChannelPatchOverwrite[] {
  return [
    {
      // @everyone can't send messages or make threads
      id: guild_id,
      type: 0, // role
      deny: (
        D.PermissionFlagsBits.SendMessages |
        D.PermissionFlagsBits.SendMessagesInThreads |
        D.PermissionFlagsBits.CreatePublicThreads |
        D.PermissionFlagsBits.CreatePrivateThreads
      ).toString(),
    },
    {
      // the bot can send messages and make public threads
      id: application_id,
      type: 1, // user
      allow: (
        D.PermissionFlagsBits.SendMessages |
        D.PermissionFlagsBits.SendMessagesInThreads |
        D.PermissionFlagsBits.CreatePublicThreads |
        D.PermissionFlagsBits.CreatePrivateThreads
      ).toString(),
    },
  ]
}

import * as D from 'discord-api-types/v10'
import { GuildRanking } from '../../../database/models'
import { PartialGuild } from '../../../database/models/guilds'
import { PartialRanking, Ranking } from '../../../database/models/rankings'
import type {
  AnyCommandView,
  CommandInteractionResponse,
  InitialInteractionContext,
  InteractionContext,
} from '../../../discord-framework'
import {
  isDeferredCtx,
  isInitialInteractionCtx,
} from '../../../discord-framework/interactions/utils/context-checks'
import { sentry } from '../../../logging/sentry'
import type { App } from '../../app/App'
import { UserError } from '../errors/UserError'
import { allRankingsPage } from '../modules/rankings/views/pages/all-rankings-page'

export const create_ranking_choice_value = 'create'

/**
 * Returns a slash command option, wich thoices for each ranking in the guild.
 */
export async function guildRankingsOption(
  app: App,
  guild: PartialGuild,
  ranking_option_name = 'ranking',
  options?: {
    optional?: boolean
    available_choices?: Ranking[]
  },
  description: string = 'Select a ranking',
): Promise<D.APIApplicationCommandBasicOption[]> {
  const rankings_choices =
    options?.available_choices ??
    (await app.db.guild_rankings.fetch({ guild_id: guild.data.id })).map(i => i.ranking)

  if (rankings_choices.length == 1 && !options?.optional) {
    return []
  }

  const choices = rankings_choices.map(item => ({
    name: item.data.name,
    value: item.data.id,
  }))

  if (choices.length == 0) {
    return []
  }

  return [
    {
      type: D.ApplicationCommandOptionType.Integer,
      name: ranking_option_name,
      description,
      required: !options?.optional,
      choices,
    },
  ]
}

export async function withOptionalSelectedRanking<
  T extends InteractionContext<
    AnyCommandView,
    D.APIGuildInteractionWrapper<D.APIChatInputApplicationCommandInteraction>
  >,
  U = Promise<T extends InitialInteractionContext<any> ? CommandInteractionResponse : void>,
>(
  app: App,
  ctx: T,
  ranking_option_value: number | undefined,
  options: {
    available_guild_rankings?: {
      ranking: PartialRanking
      guild_ranking: GuildRanking
    }[]
  },
  callback: (ranking: PartialRanking | undefined) => Promise<U>,
): Promise<U> {
  return _withSelectedRanking(app, ctx, ranking_option_value, options, callback, true)
}

export async function withSelectedRanking<
  T extends InteractionContext<
    AnyCommandView,
    D.APIGuildInteractionWrapper<D.APIChatInputApplicationCommandInteraction>
  >,
  U = Promise<T extends InitialInteractionContext<any> ? CommandInteractionResponse : void>,
>(
  app: App,
  ctx: T,
  ranking_option_value: number | undefined,
  options: {
    available_guild_rankings?: {
      ranking: PartialRanking
      guild_ranking: GuildRanking
    }[]
  },
  callback: (ranking: PartialRanking) => Promise<U>,
): Promise<U> {
  return _withSelectedRanking(
    app,
    ctx,
    ranking_option_value,
    options,
    async ranking => callback(ranking!),
    false,
  )
}

async function _withSelectedRanking<
  T extends InteractionContext<
    AnyCommandView,
    D.APIGuildInteractionWrapper<D.APIChatInputApplicationCommandInteraction>
  >,
  U = Promise<T extends InitialInteractionContext<any> ? CommandInteractionResponse : void>,
>(
  app: App,
  ctx: T,
  ranking_option_value: number | undefined,
  options: {
    available_guild_rankings?: {
      ranking: PartialRanking
      guild_ranking: GuildRanking
    }[]
  },
  callback: (ranking: PartialRanking | undefined) => Promise<U>,
  optional: boolean,
): Promise<U> {
  const guild_id: string = ctx.interaction.guild_id

  sentry.addBreadcrumb({
    message: `_withSelectedRanking`,
    data: {
      options: options,
      interaction: JSON.stringify(ctx.interaction.data),
    },
  })

  if (ranking_option_value && ranking_option_value) {
    var ranking: PartialRanking = await app.db.rankings.fetch(ranking_option_value)
  } else {
    if (optional) {
      return callback(undefined)
    }
    const available_guild_rankings =
      options.available_guild_rankings !== undefined
        ? options.available_guild_rankings
        : await app.db.guild_rankings.fetch({
            guild_id,
          })
    if (available_guild_rankings.length == 1) {
      ranking = available_guild_rankings[0].ranking
    } else if (available_guild_rankings.length == 0) {
      if (isInitialInteractionCtx(ctx)) {
        return {
          type: D.InteractionResponseType.ChannelMessageWithSource,
          data: await allRankingsPage(app, ctx),
        } as U
      } else if (isDeferredCtx(ctx)) {
        return void ctx.followup(await allRankingsPage(app, ctx)) as U
      } else {
        throw new Error(`Expected either initial or deferred interaction context`)
      }
    } else {
      throw new UserError('Please specify a ranking')
    }
  }

  return callback(ranking)
}

import type { GuildRanking, Match, Ranking } from '../../database/models'
import { Event } from '../../utils/events'
import { addMatchSummaryMessagesListeners } from '../modules/matches/match_summary'
import { addRankingChannelsListeners } from '../modules/rankings/ranking_channels'
import type { App } from './app'

export const events = () => ({
  // Match's name, outcome, or metadata modified.
  MatchUpdated: new Event<Match>(),
  // A match's players' ratings were updated
  MatchScored: new Event<Match>(),
  // Ranking was renamed or modified
  RankingUpdated: new Event<Ranking>(),
  // Guild ranking was created
  GuildRankingCreated: new Event<GuildRanking>(),
  // Guild ranking was renamed or modified
  GuildRankingUpdated: new Event<GuildRanking>(),
})

export function addAllEventListeners(app: App) {
  addRankingChannelsListeners(app)
  addMatchSummaryMessagesListeners(app)
}
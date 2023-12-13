import {
  Players,
  Matches,
  Rankings,
  Guilds,
  Users,
  QueueTeams,
  Settings,
  AccessTokens,
  MatchPlayers,
  MatchSummaryMessages,
  ActiveMatches,
  TeamPlayers,
  Teams,
  GuildRankings,
} from '../database/schema'
import { DbClient } from '../database/client'
import { App } from '../main/app/app'
import { getOrAddGuild } from '../main/modules/guilds'
import { sentry } from '../request/sentry'
import { nonNullable } from '../utils/utils'
import { sql } from 'drizzle-orm'

export async function runTests(app: App): Promise<Response> {
  await resetDatabase(app.db)
  // await testDatabase(app)
  sentry.debug(`Tested Leaderboards app (${app.config.env.ENVIRONMENT})`)
  return new Response('Successfully tested Leaderboards app', { status: 200 })
}

async function testDatabase(app: App) {
  await testMatches(app)
  // await testQueueTeams(app)
}

async function testMatches(app: App) {
  await resetDatabase(app.db)
  await addData(app.db)

  const match_1_1 = await app.db.matches.create({
    ranking_id: 1,
    team_players: [
      [1, 2],
      [3, 4],
    ],
    outcome: [0, 1],
    metadata: {},
    time_started: new Date(),
    time_finished: new Date(),
  })

  const match_1_2 = await app.db.matches.create({
    ranking_id: 2,
    team_players: [
      [1, 2],
      [3, 4],
    ],
    outcome: [0, 1],
    metadata: {},
    time_started: new Date(),
    time_finished: new Date(),
  })

  const match_2_1 = await app.db.matches.create({
    ranking_id: 1,
    team_players: [
      [1, 2],
      [3, 4],
    ],
    outcome: [0, 1],
    metadata: {},
    time_started: new Date(),
    time_finished: new Date(),
  })
}

async function testQueueTeams(app: App) {
  sentry.debug('resetting database')
  await resetDatabase(app.db)
  sentry.debug('adding data')
  await addData(app.db)

  const ranking = (await getRankingByName(app, '98623457887', 'ranking 1')).ranking
  const ranking2 = (await getRankingByName(app, '98623457887', 'ranking 2')).ranking

  const player100 = nonNullable(await app.db.players.get('100', ranking.data.id), 'player 100')
  const player200 = nonNullable(await app.db.players.get('200', ranking.data.id), 'player 200')
  const player300 = nonNullable(await app.db.players.get('300', ranking.data.id), 'player 300')
  const player400 = nonNullable(await app.db.players.get('400', ranking.data.id), 'player 400')
  const player100_2 = nonNullable(await app.db.players.get('100', ranking2.data.id), 'player 100')
  const player400_2 = nonNullable(await app.db.players.get('400', ranking2.data.id), 'player 400')

  const team_1 = await app.db.teams.create(ranking, {}, [player100, player400])
  await team_1.addToQueue()
  // queue teams: team_1 (100, 400, ranking 1)

  // the same players join the queue for ranking 2
  const team_1_2 = await app.db.teams.create(ranking2, {}, [player100_2, player400_2])
  await team_1_2.addToQueue()
  // queue teams: team_1 (100, 400, ranking 1), team_1_2 (100, 400, ranking 2)

  // user 200 and 300 join the queue for ranking 1
  const team_2 = await app.db.teams.create(ranking, {}, [player200, player300])
  await team_2.addToQueue()
  // queue teams: team_1 (100, 400, ranking 1), team_1_2 (100, 400, ranking 2), team_2 (200, 300, ranking 1)

  // user 100 and 300 join the queue for ranking 1
  const team_3 = await app.db.teams.create(ranking, {}, [player100, player300])
  let queue_team3 = await team_3.addToQueue()
  // queue teams: team_1 (100, 400, ranking 1), team_1_2 (100, 400, ranking 2), team_2 (200, 300, ranking 1), team_3 (100, 300, ranking 1)

  // add to queue again. shouldn't error
  queue_team3 = await team_3.addToQueue()

  // get player 100's queue teams. should be team 1 and 3
  let player100_queue_teams = await player100.queueTeams()
  assert(
    player100_queue_teams.filter((t) => t.in_queue).length == 2,
    'player 100 should be in queue team 1 and 3',
  )

  // user 100 leaves the queue
  assert(
    (await player300.queueTeams()).filter((t) => t.in_queue).length == 2,
    'player 300 should be in queue team 2 and 3',
  )

  await player100.removeTeamsFromQueue()
  // queue teams: team_1_2 (100, 400, ranking 2), team_2 (200, 300, ranking 1)

  assert(
    (await player100.queueTeams()).filter((t) => t.in_queue).length == 0,
    'player 200 should not be in queue',
  )
  assert(
    (await player200.queueTeams()).filter((t) => t.in_queue).length == 1,
    'player 200 should be in queue team 2',
  )
  assert(
    (await player100_2.queueTeams()).filter((t) => t.in_queue).length == 1,
    'player 100 should still be in queue team 1 ranking 2',
  )
}

async function getRankingByName(app: App, guild_id: string, name: string) {
  const guild = await getOrAddGuild(app, guild_id)
  const rankings = await guild?.guildRankings()
  const ranking = rankings.find((r) => r.ranking.data.name === name)
  assert(ranking !== undefined, `ranking ${name} should exist`)
  return ranking
}

async function resetDatabase(client: DbClient) {
  await Promise.all([
    client.db.delete(MatchPlayers),
    client.db.delete(MatchSummaryMessages),
    client.db.delete(Matches),
    client.db.delete(ActiveMatches),
    client.db.delete(QueueTeams),
    client.db.delete(TeamPlayers),
    client.db.delete(GuildRankings),
    client.db.delete(AccessTokens),
    client.db.delete(Settings),
  ])
  await Promise.all([
    client.db.execute(sql`ALTER SEQUENCE "Matches_id_seq" RESTART WITH 1`),
    client.db.execute(sql`ALTER SEQUENCE "ActiveMatches_id_seq" RESTART WITH 1`),
    client.db.delete(Teams),
    client.db.delete(Players),
    client.db.delete(Guilds),
  ])
  await Promise.all([
    client.db.execute(sql`ALTER SEQUENCE "Teams_id_seq" RESTART WITH 1`),
    client.db.execute(sql`ALTER SEQUENCE "Players_id_seq" RESTART WITH 1`),
    client.db.delete(Rankings),
    await client.db.delete(Users),
  ])
  await Promise.all([client.db.execute(sql`ALTER SEQUENCE "Rankings_id_seq" RESTART WITH 1`)])
}

async function addData(client: DbClient) {
  const guild1 = await client.guilds.create({ id: '98623457887' })
  await Promise.all([
    client.users.getOrCreate({ id: '100', name: 'one' }),
    client.users.getOrCreate({ id: '200', name: 'two' }),
    client.users.getOrCreate({ id: '300', name: 'three' }),
    client.users.getOrCreate({ id: '400', name: 'four' }),
  ])

  const ranking1 = await client.rankings.create({
    name: 'ranking 1',
    players_per_team: 2,
    num_teams: 2,
    elo_settings: {
      initial_rating: 1000,
      initial_rd: 300,
    },
  })

  const ranking2 = await client.rankings.create({
    name: 'ranking 2',
    players_per_team: 2,
    num_teams: 2,
    elo_settings: {
      initial_rating: 1000,
      initial_rd: 300,
    },
  })

  const guild_ranking_1 = await client.guild_rankings.create(guild1, ranking1, { is_admin: true })
  const guild_ranking_2 = await client.guild_rankings.create(guild1, ranking2, { is_admin: true })

  await Promise.all([
    client.players.create(await client.users.getOrCreate({ id: '100' }), ranking1),
    client.players.create(await client.users.getOrCreate({ id: '200' }), ranking1),
    client.players.create(await client.users.getOrCreate({ id: '300' }), ranking1),
    client.players.create(await client.users.getOrCreate({ id: '400' }), ranking1),
    client.players.create(await client.users.getOrCreate({ id: '100' }), ranking2),
    client.players.create(await client.users.getOrCreate({ id: '200' }), ranking2),
    client.players.create(await client.users.getOrCreate({ id: '300' }), ranking2),
    client.players.create(await client.users.getOrCreate({ id: '400' }), ranking2),
  ])
}

// runTests().then((res) => {
//   process.exit(0)
// })

function assert(condition: boolean, msg?: string): asserts condition {
  if (!condition) {
    throw new Error(msg ?? 'Assertion failed')
  }
}

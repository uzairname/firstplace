import * as D from 'discord-api-types/v10'
import type { AnyChatInputAppCommand, DiscordErrors } from '../../../discord-framework'
import type { App } from '../../app/App'
import { AnyGuildCommand, AppView } from '../../app/ViewModule'

export const github_url = 'https://github.com/uzairname/leaderboards'

export function botPermisssionsErrorMessage(app: App, e: DiscordErrors.BotPermissions): string {
  let msg = "I'm missing some permissions"

  const missing_perms = e.missingPermissionsNames

  if (missing_perms.length > 0) {
    msg = `I'm missing the following permissions: ${permsToString(missing_perms)}`
  }
  return msg + `\n[Click here to re-invite me with the required perms](${inviteUrl(app)})`
}

export const emojis = {
  green_triangle: `<:green_triangle:1198069662353735740>`,
  light_circle: `<:light_circle:1198070971513438269>`,
  red_triangle: `<:red_triangle:1198069664153079878>`,
}

export function inviteAndRoleConnectionsUrl(app: App): string {
  return app.config.env.BASE_URL + `/oauth` + app.config.OauthRoutes.BotAndRoleConnections
}

export function inviteUrl(app: App): string {
  return app.discord.botInviteURL(app.config.RequiredBotPermissions).toString()
}

export async function commandMention<T extends AppView<AnyChatInputAppCommand>>(
  app: App,
  command: T,
  guild_id?: T extends AnyGuildCommand ? string : undefined,
) {
  const name = command.base_signature.signature.name
  const type = command.base_signature.signature.type
  const commands = await app.discord.getAppCommands(guild_id)
  const discord_command = commands.find(command => command.name === name && command.type === type)
  return `</${name}:${discord_command?.id || '0'}>`
}

export function relativeTimestamp(time: Date): string {
  return `<t:${Math.floor(time.getTime() / 1000)}:R>`
}

export function dateTimestamp(time: Date): string {
  return `<t:${Math.floor(time.getTime() / 1000)}:D>`
}

/**
 * Escapes special Discord markdown characters: ( ` * _ ~ < : \ )
 */
export function escapeMd(str: string | undefined | null): string {
  if (!str) return ''
  return str
    .replace(/\\/g, `\\\\`) // must be first to avoid double escaping
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/~/g, '\\~')
    .replace(/`/g, '\\`')
    .replace(/</g, '\\<')
    .replace(/:/g, '\\:')
}

export const space = `⠀` // U+2800: Braille Pattern Blank

export function truncateString(str: string, max_length: number): string {
  return str.length > max_length ? str.slice(0, max_length - 2) + '..' : str
}

export function messageLink(guild_id: string, channel_id: string, message_id: string): string {
  return `https://discord.com/channels/${guild_id}/${channel_id}/${message_id}`
}

/**
 * Returns a message link if the message exists, otherwise null
 */
export async function existingMessageLink(
  app: App,
  guild_id: string,
  channel_id: string,
  message_id: string,
) {
  try {
    const message = await app.discord.getMessage(channel_id, message_id)
    return messageLink(guild_id, message.channel_id, message_id)
  } catch {
    return null
  }
}

export function channelMention(channel_id?: string): string {
  return `<#${channel_id || '0'}>`
}

export function memberAvatarUrl(guild_id: string, member: D.APIGuildMember): string {
  if (member.avatar) {
    const format = member.avatar.startsWith('a_') ? D.ImageFormat.GIF : D.ImageFormat.PNG
    return (
      D.RouteBases.cdn +
      D.CDNRoutes.guildMemberAvatar(guild_id, member.user.id, member.avatar, format)
    )
  } else {
    return userAvatarUrl(member.user)
  }
}

export function userAvatarUrl(user: D.APIUser) {
  if (user.avatar) {
    const format = user.avatar.startsWith('a_') ? D.ImageFormat.GIF : D.ImageFormat.PNG
    return D.RouteBases.cdn + D.CDNRoutes.userAvatar(user.id, user.avatar, format)
  } else {
    const idx = ((((Number(user.id) >> 22) % 6) + 6) % 6) as D.DefaultUserAvatarAssets
    return D.RouteBases.cdn + D.CDNRoutes.defaultUserAvatar(idx)
  }
}

export function permsToString(perms: string[]) {
  return perms.join(', ')
}

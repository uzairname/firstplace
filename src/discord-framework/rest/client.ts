import { DiscordAPIError, InternalRequest, REST, RequestData, RequestMethod } from '@discordjs/rest'
import * as D from 'discord-api-types/v10'
import { sentry } from '../../logging/sentry'
import { truncateString } from '../../main/bot/ui-helpers/strings'
import { cache } from '../../utils/cache'
import { DiscordCache } from './cache'
import { DiscordAPIUtils } from './client-helpers'
import { DiscordErrors } from './errors'
import { RESTPostAPIGuildForumThreadsResult } from './types'

export class DiscordAPIClient extends REST {
  readonly token: string
  readonly application_id: string
  readonly client_id: string
  readonly client_secret: string
  readonly public_key: string

  readonly utils: DiscordAPIUtils
  readonly cache: DiscordCache

  constructor(params: {
    token: string
    application_id: string
    client_id: string
    client_secret: string
    public_key: string
  }) {
    super({ version: '10' })
    this.setToken(params.token)
    this.token = params.token
    this.application_id = params.application_id
    this.client_id = params.client_id
    this.client_secret = params.client_secret
    this.public_key = params.public_key

    this.utils = new DiscordAPIUtils(this)

    if (!(cache['discord'] instanceof DiscordCache)) {
      cache['discord'] = new DiscordCache()
    }
    this.cache = cache['discord'] as DiscordCache
  }

  // APPLICATION COMMANDS

  async getAppCommands(guild_id?: string) {
    if (guild_id) {
      if (this.cache.guild_app_commands[guild_id]) {
        return this.cache.guild_app_commands[guild_id]
      }
      const result = (await this.fetch(
        RequestMethod.Get,
        D.Routes.applicationGuildCommands(this.application_id, guild_id),
      )) as D.RESTGetAPIApplicationGuildCommandResult[]
      this.cache.guild_app_commands[guild_id] = result
      return result
    } else {
      if (this.cache.app_commands) {
        return this.cache.app_commands
      }
      const result = (await this.fetch(
        RequestMethod.Get,
        D.Routes.applicationCommands(this.application_id),
      )) as D.RESTGetAPIApplicationCommandsResult
      this.cache.app_commands = result
      return result
    }
  }

  async replaceGuildCommands(guild_id: string, body: D.RESTPutAPIApplicationGuildCommandsJSONBody) {
    return (await this.fetch(
      RequestMethod.Put,
      D.Routes.applicationGuildCommands(this.application_id, guild_id),
      { body },
    )) as D.RESTPutAPIApplicationGuildCommandsResult
  }

  async replaceGlobalCommands(body: D.RESTPutAPIApplicationCommandsJSONBody) {
    return (await this.fetch(RequestMethod.Put, D.Routes.applicationCommands(this.application_id), {
      body,
    })) as D.RESTPutAPIApplicationCommandsResult
  }

  // USERS

  async fetchUser(user_id: string) {
    return (await this.fetch(RequestMethod.Get, D.Routes.user(user_id))) as D.RESTGetAPIUserResult
  }

  // CHANNELS

  @requiresBotPerms(D.PermissionFlagsBits.ManageChannels)
  async createGuildChannel(
    guild_id: string,
    body: D.RESTPostAPIGuildChannelJSONBody,
    reason?: string,
  ) {
    try {
      return (await this.fetch(RequestMethod.Post, D.Routes.guildChannels(guild_id), {
        body,
        reason,
      })) as D.RESTPostAPIGuildChannelResult
    } catch (e) {
      if (
        e instanceof DiscordAPIError &&
        e.code === D.RESTJSONErrorCodes.CannotExecuteActionOnThisChannelType
      ) {
        throw new DiscordErrors.ForumInNonCommunityServer()
      }
      throw e
    }
  }

  async getChannel(channel_id: string): Promise<D.APIChannel> {
    return (await this.fetch(
      RequestMethod.Get,
      D.Routes.channel(channel_id),
      {},
    )) as D.RESTGetAPIChannelResult
  }

  async getGuildChannels(guild_id: string) {
    return (await this.fetch(
      RequestMethod.Get,
      D.Routes.guildChannels(guild_id),
    )) as D.RESTGetAPIGuildChannelsResult
  }

  @requiresBotPerms(D.PermissionFlagsBits.ManageChannels)
  async editChannel(channel_id: string, body: D.RESTPatchAPIChannelJSONBody) {
    return (await this.fetch(RequestMethod.Patch, D.Routes.channel(channel_id), {
      body,
    })) as D.RESTPatchAPIChannelResult
  }

  @requiresBotPerms(D.PermissionFlagsBits.ManageChannels)
  async deleteChannel(channel_id: string) {
    return (await this.fetch(
      RequestMethod.Delete,
      D.Routes.channel(channel_id),
    )) as D.RESTDeleteAPIChannelResult
  }

  // THREADS

  @requiresBotPerms(D.PermissionFlagsBits.CreatePublicThreads)
  async createPublicThread(
    body: D.RESTPostAPIChannelThreadsJSONBody,
    channel_id: string,
    message_id?: string,
  ) {
    return (await this.fetch(RequestMethod.Post, D.Routes.threads(channel_id, message_id), {
      body,
    })) as D.RESTPostAPIChannelMessagesThreadsResult | D.RESTPostAPIChannelThreadsResult
  }

  @requiresBotPerms(D.PermissionFlagsBits.CreatePrivateThreads)
  async createPrivateThread(body: D.RESTPostAPIChannelThreadsJSONBody, channel_id: string) {
    return (await this.fetch(RequestMethod.Post, D.Routes.threads(channel_id), {
      body,
    })) as D.RESTPostAPIChannelThreadsResult
  }

  @requiresBotPerms(D.PermissionFlagsBits.SendMessages)
  async createForumPost(forum_id: string, body: D.RESTPostAPIGuildForumThreadsJSONBody) {
    return (await this.fetch(RequestMethod.Post, D.Routes.threads(forum_id), {
      body,
    })) as RESTPostAPIGuildForumThreadsResult
  }

  @requiresBotPerms(D.PermissionFlagsBits.ManageThreads)
  async pinThread(thread_id: string) {
    // https://discord.com/developers/docs/resources/channel#modify-channel
    return (await this.fetch(RequestMethod.Put, D.Routes.channel(thread_id), {
      body: {
        flags: D.ChannelFlags.Pinned,
      },
    })) as D.APIChannel
  }

  @requiresBotPerms(D.PermissionFlagsBits.ManageThreads)
  async deleteThread(channel_id: string) {
    return (await this.fetch(
      RequestMethod.Delete,
      D.Routes.channel(channel_id),
    )) as D.RESTDeleteAPIChannelResult
  }

  // MESSAGES

  @requiresBotPerms(D.PermissionFlagsBits.SendMessages)
  async createMessage(channel_id: string, body: D.RESTPostAPIChannelMessageJSONBody) {
    return (await this.fetch(RequestMethod.Post, D.Routes.channelMessages(channel_id), {
      body,
    })) as D.RESTPostAPIChannelMessageResult
  }

  async getMessage(channel_id: string, message_id: string) {
    return (await this.fetch(
      RequestMethod.Get,
      D.Routes.channelMessage(channel_id, message_id),
    )) as D.RESTGetAPIChannelMessageResult
  }

  @requiresBotPerms(D.PermissionFlagsBits.ManageMessages)
  async editMessage(
    channel_id: string,
    message_id: string,
    body: D.RESTPatchAPIChannelMessageJSONBody,
  ) {
    return (await this.fetch(RequestMethod.Patch, D.Routes.channelMessage(channel_id, message_id), {
      body,
    })) as D.RESTPatchAPIChannelMessageResult
  }

  // @requiresBotPerms_(D.PermissionFlagsBits.ManageMessages)
  @requiresBotPerms(D.PermissionFlagsBits.ManageMessages)
  async pinMessage(channel_id: string, message_id: string) {
    return (await this.fetch(
      RequestMethod.Put,
      D.Routes.channelPin(channel_id, message_id),
    )) as D.RESTPutAPIChannelPinResult
  }

  @requiresBotPerms(D.PermissionFlagsBits.ManageMessages)
  async deleteMessageIfExists(channel_id?: string | null, message_id?: string | null) {
    if (!channel_id || !message_id) return
    try {
      return (await this.fetch(
        RequestMethod.Delete,
        D.Routes.channelMessage(channel_id, message_id),
      )) as D.RESTDeleteAPIChannelMessageResult
    } catch (e) {
      if (
        !(
          e instanceof DiscordAPIError &&
          (e.code === D.RESTJSONErrorCodes.UnknownMessage ||
            e.code === D.RESTJSONErrorCodes.UnknownChannel)
        )
      ) {
        throw e
      }
    }
  }

  // GUILD

  async getGuild(guild_id: string) {
    return (await this.fetch(
      RequestMethod.Get,
      D.Routes.guild(guild_id),
    )) as D.RESTGetAPIGuildResult
  }

  async getGuildMember(guild_id: string, user_id: string) {
    return (await this.fetch(
      RequestMethod.Get,
      D.Routes.guildMember(guild_id, user_id),
    )) as D.RESTGetAPIGuildMemberResult
  }

  // GUILD ROLES

  @requiresBotPerms(D.PermissionFlagsBits.ManageRoles)
  async makeRole(guild_id: string, body: D.RESTPostAPIGuildRoleJSONBody) {
    return (await this.fetch(RequestMethod.Post, D.Routes.guildRoles(guild_id), {
      body,
    })) as D.RESTPostAPIGuildRoleResult
  }

  async getRoles(guild_id: string) {
    return (await this.fetch(
      RequestMethod.Get,
      D.Routes.guildRoles(guild_id),
    )) as D.RESTGetAPIGuildRolesResult
  }

  @requiresBotPerms(D.PermissionFlagsBits.ManageRoles)
  async editRole(guild_id: string, role_id: string, body: D.RESTPatchAPIGuildRoleJSONBody) {
    return (await this.fetch(RequestMethod.Patch, D.Routes.guildRole(guild_id, role_id), {
      body,
    })) as D.RESTPatchAPIGuildRoleResult
  }

  @requiresBotPerms(D.PermissionFlagsBits.ManageRoles)
  async deleteRole(guild_id: string, role_id: string) {
    return (await this.fetch(
      RequestMethod.Delete,
      D.Routes.guildRole(guild_id, role_id),
    )) as D.RESTDeleteAPIGuildRoleResult
  }

  // MEMBER ROLES

  @requiresBotPerms(D.PermissionFlagsBits.ManageRoles)
  async addRoleToMember(guild_id: string, user_id: string, role_id: string): Promise<void> {
    await this.fetch(RequestMethod.Put, D.Routes.guildMemberRole(guild_id, user_id, role_id))
  }

  @requiresBotPerms(D.PermissionFlagsBits.ManageRoles)
  async removeRoleFromMember(guild_id: string, user_id: string, role_id: string): Promise<void> {
    await this.fetch(RequestMethod.Delete, D.Routes.guildMemberRole(guild_id, user_id, role_id))
  }

  // INTERACTIONS

  /**
   * After calling this endpoint, the entire request will be canceled from Discord's side.
   */
  async createInteractionResponse(
    interaction_id: string,
    interaction_token: string,
    body: D.RESTPostAPIInteractionCallbackJSONBody,
  ) {
    sentry.addBreadcrumb({
      category: 'interaction',
      message: 'Creating initial interaction response',
    })
    return this.fetch(
      RequestMethod.Post,
      D.Routes.interactionCallback(interaction_id, interaction_token),
      { body },
    )
  }

  async createFollowupMessage(
    interaction_token: string,
    body: D.RESTPostAPIInteractionFollowupJSONBody,
  ) {
    return (await this.fetch(
      RequestMethod.Post,
      D.Routes.webhook(this.application_id, interaction_token),
      { body },
    )) as D.RESTPostAPIWebhookWithTokenWaitResult
  }

  async editOriginalInteractionResponse(
    interaction_token: string,
    body: D.RESTPatchAPIInteractionOriginalResponseJSONBody,
  ) {
    return this.fetch(
      RequestMethod.Patch,
      D.Routes.webhookMessage(this.application_id, interaction_token, '@original'),
      { body },
    )
  }

  async deleteInteractionResponse(interaction_token: string, message_id?: string) {
    await this.fetch(
      RequestMethod.Delete,
      D.Routes.webhookMessage(this.application_id, interaction_token, message_id ?? '@original'),
    )
  }

  // LINKED ROLES

  async updateRoleConnectionsMetadata(body: D.RESTPutAPIApplicationRoleConnectionMetadataJSONBody) {
    await this.fetch(
      RequestMethod.Put,
      D.Routes.applicationRoleConnectionMetadata(this.application_id),
      {
        body,
      },
    )
  }
  async updateUserRoleConnection(
    access_token: string,
    body: D.RESTPutAPICurrentUserApplicationRoleConnectionJSONBody,
  ) {
    await this.fetch(
      RequestMethod.Put,
      D.Routes.userApplicationRoleConnection(this.application_id),
      {
        body,
      },
      access_token,
    )
  }

  // OAUTH

  botInviteURL(permissions?: bigint): URL {
    const params = new URLSearchParams({
      client_id: this.client_id,
      permissions: permissions?.toString() ?? '',
      scope: 'bot',
    })
    const url = new URL(inAppBotAuthorizationURL)
    url.search = params.toString()
    return url
  }

  oauthURL(
    redirect_uri: string,
    scopes: D.OAuth2Scopes[],
    state: string,
    permissions?: bigint,
  ): URL {
    const params = new URLSearchParams({
      client_id: this.client_id,
      response_type: 'code',
      scope: scopes.join(' '),
      redirect_uri,
      state: state,
      permissions: permissions?.toString() ?? '',
    })
    const url = new URL(D.OAuth2Routes.authorizationURL)
    url.search = params.toString()
    return url
  }

  async getOauthToken(code: string, redirect_uri: string) {
    const body = new URLSearchParams({
      client_id: this.client_id,
      client_secret: this.client_secret,
      grant_type: 'authorization_code',
      code,
      redirect_uri,
    }).toString()

    const tokendata = await this.fetch(RequestMethod.Post, D.Routes.oauth2TokenExchange(), {
      body: body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      auth: false,
      passThroughBody: true,
    })
    return tokendata as D.RESTPostOAuth2AccessTokenResult
  }

  async refreshOauthToken(refresh_token: string) {
    const body = new URLSearchParams({
      client_id: this.client_id,
      client_secret: this.client_secret,
      grant_type: 'refresh_token',
      refresh_token,
    })
    const tokendata = await this.fetch(RequestMethod.Post, D.Routes.oauth2TokenExchange(), {
      body: body,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    })
    return tokendata as D.RESTPostOAuth2AccessTokenResult
  }

  async getOauthUser(access_token: string) {
    return (await this.fetch(
      RequestMethod.Get,
      D.Routes.oauth2CurrentAuthorization(),
      {},
      access_token,
    )) as D.RESTGetAPIOAuth2CurrentAuthorizationResult
  }

  async fetch(
    method: 'POST' | 'GET' | 'PATCH' | 'PUT' | 'DELETE',
    route: `/${string}`,
    options: RequestData = {},
    bearer_token?: string,
  ): Promise<unknown> {
    const start_time = Date.now()
    try {
      var response = await this.request(
        {
          ...options,
          fullRoute: route,
          method: method as RequestMethod,
        },
        bearer_token,
      )
      return response
    } catch (e) {
      var error = e
      throw e
    } finally {
      sentry.request_data['discord requests'] =
        ((sentry.request_data['discord requests'] as number) || 0) + 1

      sentry.addBreadcrumb({
        category: `Fetched Discord ${method?.toString() ?? ``} ${route}`,
        type: 'http',
        level: error ? 'error' : 'info',
        data: {
          route: `Route: ${method?.toString()} ${route}`,
          'time taken': `${Date.now() - start_time}ms`,
          options: JSON.stringify(options),
          response: truncateString(JSON.stringify(response) ?? '', 500),
          error: JSON.stringify(error),
        },
      })
    }
  }

  request(options: InternalRequest, bearer_token?: string): Promise<unknown> {
    return bearer_token
      ? new REST({
          version: '10',
          authPrefix: 'Bearer',
        })
          .setToken(bearer_token)
          .request(options)
      : super.request(options)
  }
}

function requiresBotPerms(permissions: bigint) {
  return function (target: Object, propertyKey: string, descriptor: PropertyDescriptor) {
    const original_method = descriptor.value
    descriptor.value = async function (...args: unknown[]) {
      try {
        return await original_method.apply(this, args)
      } catch (e) {
        if (e instanceof DiscordAPIError && e.code === D.RESTJSONErrorCodes.MissingPermissions) {
          throw new DiscordErrors.BotPermissions(permissions)
        }
        throw e
      }
    }
    return descriptor
  }
}

// Used to invite the bot, nothing else
const inAppBotAuthorizationURL = 'https://discord.com/api/oauth2/authorize'

import * as D from 'discord-api-types/v10'

export const features = (environment: string) => {
  const dev = environment === 'development'

  return {
    ExperimentalViews: dev,
    DevGuildCommands: dev,
    DetailedErrorMessages: dev,

    RoleConnectionsMetadata: dev,
    QueueMessage: dev,
    HelpReference: dev,
  }
}

export class Config {
  readonly OauthRoutes = {
    Redirect: '/redirect',
    LinkedRoles: '/linkedroles',
    InviteOauth: '/invite',
  }

  readonly DevGuildId = '1041458052055978024'

  readonly RequiredBotPermissions =
    D.PermissionFlagsBits.ManageChannels |
    D.PermissionFlagsBits.ManageThreads |
    D.PermissionFlagsBits.ManageRoles

  public readonly OauthRedirectURI: string
  readonly features: ReturnType<typeof features>

  constructor(readonly env: Env) {
    this.OauthRedirectURI = env.BASE_URL + `/oauth` + this.OauthRoutes.Redirect
    this.features = features(env.ENVIRONMENT)
  }
}

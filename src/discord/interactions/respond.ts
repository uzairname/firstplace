import { APIInteraction, InteractionResponseType, InteractionType } from 'discord-api-types/v10'

import { sentry } from '../../utils/globals'

import { DiscordRESTClient } from '../rest/client'

import { respondToViewInteraction } from '../views/view_helpers'
import { onInteractionErrorCallback } from '../views/types'
import { FindViewCallback } from '../views/types'
import { verify } from './verify'
import { json } from 'itty-router'

export async function respondToDiscordInteraction(
  bot: DiscordRESTClient,
  request: Request,
  getView: FindViewCallback,
  onError: onInteractionErrorCallback,
): Promise<Response> {
  if (await verify(request, bot.public_key)) {
    var interaction = (await request.json()) as APIInteraction
  } else {
    sentry.debug('Invalid interaction request')
    return new Response(null, { status: 401 })
  }

  if (interaction.type === InteractionType.Ping) {
    return json({ type: InteractionResponseType.Pong })
  } else {
    const response = await respondToViewInteraction(interaction, bot, getView, onError)
    return json(response) || new Response(null, { status: 204 })
  }
}

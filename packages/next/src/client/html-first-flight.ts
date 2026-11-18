import { startTransition } from 'react'
import { dispatchAppRouterAction } from './components/use-action-queue'
import { ACTION_REFRESH } from './components/router-reducer/router-reducer-types'

/**
 * HTML-first Flight (`experimental.htmlFirstFlight`): the initial payload can
 * leave out static content that React adopts from the HTML. If that content
 * has to render with no HTML behind it and the server did not send it later
 * (a boundary client rendering after an error), refetch the current route.
 * RSC requests always get full payloads, so the refetch renders the full
 * content. The other cached routes stay valid, so the caches are kept.
 */
export function recoverMissingHTML(): void {
  startTransition(() => {
    dispatchAppRouterAction({ type: ACTION_REFRESH, keepCaches: true })
  })
}

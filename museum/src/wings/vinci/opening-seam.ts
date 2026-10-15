/** THE WING'S OPENING, AWAITED BEFORE THE DESCENT: the Arno card, which
 * settles when the visitor starts, when the store cannot hang the drawing, or
 * when it is cut short; the descent begins in every case. A driven browser
 * meets it only where its address asks for it (`?opening=arno`). True when a
 * card stood and the visitor went in. */
import { openArnoCard, vinciArnoAsked, type ArnoCardOptions } from './opening/arno-card'

export async function awaitOpening(host: HTMLElement, options: Pick<ArnoCardOptions, 'under'> = {}): Promise<boolean> {
  if (navigator.webdriver && !vinciArnoAsked()) return false
  return (await openArnoCard(host, options)) === 'started'
}

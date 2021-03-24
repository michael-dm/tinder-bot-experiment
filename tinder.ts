import { Browser, HTTPRequest, HTTPResponse, Page, Target } from 'puppeteer'
import { Subject } from 'rxjs'
import { injectFindElement, wait } from './util'

export class Tinder {
  private page: Page
  public like$: Subject<null>
  public pass$: Subject<null>
  public nbMatches = 0
  public nbMsgMatches = 0
  public nbLikedMe = 0

  constructor(
    private browser: Browser,
    private googleLogin: string,
    private googlePassword: string,
    private latitude: number,
    private longitude: number
  ) {
    const context = browser.defaultBrowserContext()
    context.overridePermissions('https://tinder.com/app/recs', ['geolocation'])

    this.like$ = new Subject()
    this.pass$ = new Subject()
  }

  log(msg: string, val?: any) {
    console.log(`Tinder : ${msg}`, val)
  }

  async ready() {
    this.page = await this.browser.newPage()
    await this.page.setGeolocation({
      latitude: this.latitude,
      longitude: this.longitude,
    })
    await this.page.setRequestInterception(true)
    this.createListeners()
    await this.page.goto('https://tinder.com/app/recs', {
      waitUntil: 'networkidle0',
    })

    await wait(3000)
    await injectFindElement(this.page)

    if (!this.isLoggedIn()) {
      this.log('Not logged in.')
      await this.loginFlow()
      this.log('Finished logging in.')
    } else {
      this.log('Already logged in.')
    }
  }

  createListeners() {
    this.page.on('request', (request) => {
      const likeUrl = 'https://api.gotinder.com/like'
      const passUrl = 'https://api.gotinder.com/pass'

      if (request.resourceType() === 'image') request.abort()

      if (
        request.method() === 'POST' &&
        request.url().substr(0, likeUrl.length) === likeUrl
      ) {
        this.like$.next()
      }
      if (
        request.method() === 'GET' &&
        request.url().substr(0, passUrl.length) === passUrl
      ) {
        this.pass$.next()
      }

      request.continue().catch((e) => {})
    })

    this.page.on('response', async (response) => {
      const matchesUrl =
        'https://api.gotinder.com/v2/matches?locale=en&count=60&message=0'
      const msgMatchesUrl =
        'https://api.gotinder.com/v2/matches?locale=en&count=60&message=1'
      const likedMeUrl =
        'https://api.gotinder.com/v2/fast-match/teaser?locale=en'

      if (response.request().method() !== 'GET' || response.status() !== 200)
        return

      if (response.url().substr(0, matchesUrl.length) === matchesUrl) {
        try {
          const res: any = await response.json()
          this.nbMatches = res.data.matches.length
        } catch (e) {
          this.log('Matches error', e)
        }
      }
      if (response.url().substr(0, msgMatchesUrl.length) === msgMatchesUrl) {
        try {
          const res: any = await response.json()
          this.nbMsgMatches = res.data.matches.length
        } catch (e) {
          this.log('MatchesMsg error', e)
        }
      }
      if (response.url().substr(0, likedMeUrl.length) === likedMeUrl) {
        try {
          const res: any = await response.json()
          this.nbLikedMe = res.data.count
        } catch (e) {
          this.log('LikedMe error', e)
        }
      }
    })
  }

  isLoggedIn() {
    return this.page.url() !== 'https://tinder.com/'
  }

  async loginFlow() {
    await this.page.evaluate(() => {
      ;(<any>window).findElement('button', 'log in').click()
      setTimeout(() => {
        ;(<any>window).findElement('button', 'log in with google').click()
      }, 2000)
    })
    const popupPage = await new Promise<Page>((x) =>
      this.page.once('popup', (page) => x(page))
    )
    this.log('Found google login popup !')
    await popupPage.waitForSelector('#identifierId')
    await popupPage.$eval(
      '#identifierId',
      (el: HTMLInputElement, login: string) => (el.value = login),
      this.googleLogin
    )
    await popupPage.$eval('#identifierNext button', (el: HTMLButtonElement) =>
      el.click()
    )
    await popupPage.waitForSelector('#password input')
    await popupPage.$eval(
      '#password input',
      (el: HTMLInputElement, password: string) => (el.value = password),
      this.googlePassword
    )
    await popupPage.$eval('#passwordNext button', (el: HTMLButtonElement) =>
      el.click()
    )
    await new Promise((x) => popupPage.once('close', (page) => x(null)))
    await this.page.waitForNavigation({
      waitUntil: 'networkidle0',
    })
    await wait(2000)
  }

  isOutOfLike() {
    return this.page.evaluate(
      () => !!(<any>window).findElement('h3', "you're out of likes!")
    )
  }

  hidePopup() {
    return this.page.evaluate(() => {
      var noThanksBtn = (<any>window).findElement('button', 'no thanks')
      if (noThanksBtn) noThanksBtn.click()
      var maybeLaterBtn = (<any>window).findElement('button', 'maybe later')
      if (maybeLaterBtn) maybeLaterBtn.click()
      var notInterestedBtn = (<any>window).findElement(
        'button',
        'not interested'
      )
      if (notInterestedBtn) notInterestedBtn.click()
      var backToTinderBtn: any = document.querySelector(
        'button[title="Back to Tinder"'
      )
      if (backToTinderBtn) backToTinderBtn.click()
    })
  }

  like() {
    return this.page.keyboard.press('ArrowRight')
  }

  pass() {
    return this.page.keyboard.press('ArrowLeft')
  }

  totalMatches() {
    return this.nbLikedMe + this.nbMatches + this.nbMsgMatches
  }
}

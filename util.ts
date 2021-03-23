import { Page } from 'puppeteer'

const wait = (millis: number) =>
  new Promise((resolve) => setTimeout(resolve, millis))

const randomItem = (array: ArrayLike<unknown>) =>
  array[Math.floor(Math.random() * array.length)]

function injectFindElement(page: Page) {
  return page.evaluate(() => {
    ;(<any>window).findElement = (tag: string, text: string) => {
      const els = <any>document.querySelectorAll('*')
      for (let el of els) {
        if (el.innerHTML && el.innerHTML.toLowerCase() === text) {
          return el.tagName.toLowerCase() === tag ? el : el.closest(tag)
        }
      }
    }
  })
}

export { wait, randomItem, injectFindElement }

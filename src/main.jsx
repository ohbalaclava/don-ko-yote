import './app.css'

import { JiuchiChooser } from './modules/JiuchiChooser'

import m from "mithril";

function DonKoYoteApp () {
  return {
    view: () => (
      <main class="relative" id="app">
        <JiuchiChooser/>
      </main>
    )
  }
}

m.mount(document.body, DonKoYoteApp)

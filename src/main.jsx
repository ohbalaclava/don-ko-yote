import './app.css'

import { JiuchiChooser } from './modules/JiuchiChooser'
import { MeterChooser } from './modules/MeterChooser'

import m from "mithril";

function DonKoYoteApp () {
  return {
    view: () => (
      <main class="relative" id="app">
        <JiuchiChooser/>
        <MeterChooser/>
      </main>
    )
  }
}

m.mount(document.body, DonKoYoteApp)

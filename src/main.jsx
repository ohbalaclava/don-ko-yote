import './app.css'
import m from "mithril";

function DonKoYoteApp () {
  return {
    view: () => (
      <main class="relative" id="app">
      </main>
    )
  }
}

m.mount(document.body, DonKoYoteApp)

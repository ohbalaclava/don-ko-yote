import './app.css'

import {JiuchiChooser} from './modules/JiuchiChooser'
import {Score} from './modules/Score'

import m from "mithril";

function DonKoYoteApp() {
    return {
        view: () => (
            <main class="relative" id="app">
                <JiuchiChooser/>
                <Score/>
            </main>
        )
    }
}

m.mount(document.body, DonKoYoteApp)

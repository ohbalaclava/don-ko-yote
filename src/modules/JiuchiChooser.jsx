import '@tailwindplus/elements';

import { Chooser } from './Chooser'

import m from "mithril";

export function JiuchiChooser(initialVnode) {
    const items = [
        {
            name: "Gobu Gobu",
            action: e => {}
        },
        {
            name: "Shichisan",
            action: e => {}
        },
    ];
    return {
        view: (vnode) => {
            return (
                <Chooser items={items}/>
            )
        }
    }
}
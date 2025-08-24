import '@tailwindplus/elements';

import { Chooser } from './Chooser'

import model from '../data/model'

import m from "mithril";

export function JiuchiChooser(initialVnode) {
    const items = model.jiuchis.map((jiuchi, index, arr) => {
        let item = {
            name: jiuchi.name,
            data: jiuchi
        };

        if (jiuchi.name == model.jiuchi) {
            item.default = true;
        }

        return item;
    });

    return {
        view: (vnode) => {
            return (
                <Chooser items={items} action={item => model.jiuchi = item.data}/>
            )
        }
    }
};
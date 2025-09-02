import '@tailwindplus/elements';

import { Chooser } from './Chooser'

import model from '../data/model'

// required but hidden by use of jsx
import m from "mithril";

export function JiuchiChooser(initialVnode) {
    const items = model.getJiuchis().map((jiuchi, index, arr) => {
        let item = {
            name: jiuchi.name,
            data: jiuchi
        };

        if (jiuchi.name === model.getCurrentJiuchi().name) {
            item.default = true;
        }

        return item;
    });

    return {
        view: (vnode) => {
            return (
                <Chooser items={items} action={item => model.setCurrentJiuchi(item.data)}/>
            )
        }
    }
};
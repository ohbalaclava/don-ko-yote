import '@tailwindplus/elements';

import { Chooser } from './Chooser'

import m from "mithril";

export function MeterChooser(initialVnode) {
    const items = [
        {
            name: '3'
        },
        {
            name: '4',
            default: true
        },
        {
            name: '5'
        }
    ];
    
    return {
        view: (vnode) => {
            return (
                <Chooser items={items}/>
            )
        }
    }
}
// required but hidden by use of jsx
import m from "mithril";

import {Dot} from "./Dot.jsx";
import model from "../data/model.js";

export function DotNotation(initialVnode) {
    function beat(code, division) {
        let start = division * 2;
        return code.substring(start, start + 2);
    }

    function meter2Dots(code) {
        return (
            <svg viewBox="0 0 81 20" xmlns="http://www.w3.org/2000/svg">
                <Dot x="27" y="10" r="5" beat={beat(code, 0)}/>
                <Dot x="54" y="10" r="5" beat={beat(code, 1)}/>
            </svg>
        )
    }

    function meter3Dots(code) {
        return (
            <svg viewBox="0 0 80 20" xmlns="http://www.w3.org/2000/svg">
                <Dot x="25" y="10" r="5" beat={beat(code, 0)}/>
                <Dot x="40" y="10" r="5" beat={beat(code, 1)}/>
                <Dot x="55" y="10" r="5" beat={beat(code, 2)}/>
            </svg>
        );
    }

    return {
        view: (vnode) => {
            return (() => {
                    switch (model.getCurrentJiuchi().meter) {
                        case 2:
                            return meter2Dots(vnode.attrs.code);
                        case 3:
                            return meter3Dots(vnode.attrs.code);
                    }
                }
            )();
        }
    }
}
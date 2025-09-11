// required but hidden by use of jsx
import m from "mithril";

import {Dot} from "./Dot.jsx";

export function DotNotation(initialVnode) {
    function beat(code, division) {
        let start = division * 2;
        return code.substring(start, start + 2);
    }

    return {
        view: (vnode) => {
            return (
                <svg viewBox="0 0 80 20" xmlns="http://www.w3.org/2000/svg">
                    <Dot x="25" y="10" r="5" beat={beat(vnode.attrs.code, 0)}/>
                    <Dot x="40" y="10" r="5" beat={beat(vnode.attrs.code, 1)}/>
                    <Dot x="55" y="10" r="5" beat={beat(vnode.attrs.code, 2)}/>
                </svg>
            )
        }
    }
}
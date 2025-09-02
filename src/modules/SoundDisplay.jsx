// required but hidden by use of jsx
import m from "mithril";

export function SoundDisplay(initialVnode) {
    return {
        view: (vnode) => {
            return (
                <div>{vnode.attrs.sound.sound}</div>
            )
        }
    }
}
// required but hidden by use of jsx
import m from "mithril";
import {DotNotation} from "./DotNotation.jsx";

export function SoundDisplay(initialVnode) {
    return {
        view: (vnode) => {
            return (
                <div className="overflow-hidden rounded-lg border border-gray-100 bg-white shadow-xs dark:border-gray-800 dark:bg-gray-900 dark:shadow-gray-700/25">
                    <DotNotation code={vnode.attrs.sound.dot}/>
                    <div className="p-4 sm:p-6">
                        <a href="#">
                            <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                                {vnode.attrs.sound.sound}
                            </h3>
                        </a>
                    </div>
                </div>
            )
        }
    }
}
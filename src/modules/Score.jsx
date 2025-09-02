import { SoundDisplay} from "./SoundDisplay";

import model from '../data/model'

// required but hidden by use of jsx
import m from "mithril";

export function Score(initialVnode) {
    return {
        view: (vnode) => {
            return (
                <div>
                    {model.getCurrentJiuchi().data.map((item) => {
                        return (<SoundDisplay sound={item}/>);
                    })}
                </div>
            )
        }
    }
}
// required but hidden by use of jsx
import m from "mithril";

export function Dot(initialVnode) {
    function crossPath(x, y, r) {
        let w = 2 * r;
        let xl = x - r;
        let yt = y - r;
        let yb = Number(y) + Number(r);
        return "M " + xl + " " + yt + " l " + w + " " + w + " M " + xl + " " + yb + " l " + w + " " + (-w);
    }

    return {
        view: (vnode) => {
            return ((x, y, r, beat) => {
                switch (beat) {
                    case "00":
                        return <circle cx={x} cy={y} r={r} className="dot_empty"/>;
                    case "10":
                        return <circle cx={x} cy={y} r={r} className="dot_full"/>;
                    case "11":
                        return (
                            <g>
                                <circle cx={x} cy={y} r={r} className="dot_full"/>
                                <path d={"M " + x + " " + (y - r - 1) + " v " + (2 * r + 2)} className="dot_break"/>
                            </g>
                        );
                    case "12":
                        return (
                            <g>
                                <circle cx={x} cy={y} r={r} className="dot_full"/>
                                <path d={"M " + x + " " + y + " h " + (r + 1)} className="dot_break"/>
                                <path d={"M " + x + " " + (y - r - 1) + " v " + (2 * r + 2)} className="dot_break"/>
                            </g>
                        );
                    case "20":
                        return (
                            <g>
                                <circle cx={x} cy={y} r={r} className="dot_full"/>
                                <path d={"M " + (x - r - 1) + " " + y + " h " + (2 * r + 2)} className="dot_break"/>
                            </g>
                        );
                    case "21":
                        return (
                            <g>
                                <circle cx={x} cy={y} r={r} className="dot_full"/>
                                <path d={"M " + (x - r - 1) + " " + y + " h " + (r + 1)} className="dot_break"/>
                                <path d={"M " + x + " " + (y - r - 1) + " v " + (2 * r + 2)} className="dot_break"/>
                            </g>
                        );
                    case "22":
                        return (
                            <g>
                                <circle cx={x} cy={y} r={r} className="dot_full"/>
                                <path d={"M " + (x - r - 1) + " " + y + " h " + (2 * r + 2)} className="dot_break"/>
                                <path d={"M " + x + " " + (y - r - 1) + " v " + (2 * r + 2)} className="dot_break"/>
                            </g>
                        );
                    case "30":
                        return <path d={crossPath(x, y, r)} className="dot_ki"/>;
                }
            })(vnode.attrs.x, vnode.attrs.y, vnode.attrs.r, vnode.attrs.beat);
        }
    }
}
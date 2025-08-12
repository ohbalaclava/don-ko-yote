import '@tailwindplus/elements';

import m from "mithril";

export function Chooser(initialVnode) {
    let selection = initialVnode.attrs.items.find(e => Object.hasOwn(e, 'default')) || initialVnode.attrs.items[0];

    return {
        view: (vnode) => {
            return (
                <el-dropdown class="inline-block">
                    <button class="inline-flex w-full justify-center gap-x-1.5 rounded-md bg-white px-3 py-2 text-sm font-semibold text-gray-900 shadow-xs ring-1 ring-gray-300 ring-inset hover:bg-gray-50">
                        {vnode.attrs.title ? vnode.attrs.title : selection.name}
                        <svg viewBox="0 0 20 20" fill="currentColor" data-slot="icon" aria-hidden="true" class="-mr-1 size-5 text-gray-400">
                            <path d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06Z" clip-rule="evenodd" fill-rule="evenodd" />
                        </svg>
                    </button>

                    <el-menu anchor="bottom end" popover class="jorigin-top-right rounded-md bg-white shadow-lg ring-1 ring-black/5 transition transition-discrete [--anchor-gap:--spacing(2)] focus:outline-hidden data-closed:scale-95 data-closed:transform data-closed:opacity-0 data-enter:duration-100 data-enter:ease-out data-leave:duration-75 data-leave:ease-in">
                        <div class="py-1">
                            {
                                vnode.attrs.items.map(element => (
                                    <a href="#" class="block px-4 py-2 text-sm text-gray-700 focus:bg-gray-100 focus:text-gray-900 focus:outline-hidden"
                                        onclick={
                                            e => {
                                                selection = element;
                                                if (e.action) e.action(e); else if (vnode.attrs.action) vnode.attrs.action(e);
                                            }
                                        }>
                                            {element.name}
                                    </a>
                                ))
                            }
                        </div>
                    </el-menu>
                </el-dropdown>
            )
        }
    }
}
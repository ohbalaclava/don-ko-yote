import m from 'mithril';

function Item() {
  return {
    view({ attrs: { label, sublabel, onclick } }) {
      return m(
        'button',
        {
          class:
            'w-full flex flex-col text-left px-4 py-3.5 border-b border-gray-100 dark:border-gray-800 active:bg-gray-50 dark:active:bg-gray-800 text-gray-900 dark:text-white',
          onclick,
        },
        [
          m('span', { class: 'font-medium' }, label),
          sublabel
            ? m('span', { class: 'text-xs text-gray-400 dark:text-gray-500 mt-0.5' }, sublabel)
            : null,
        ]
      );
    },
  };
}

export function ImportSheet() {
  return {
    view({ attrs: { onClose, onImportScore, onImportPatterns } }) {
      function wrap(fn) {
        return () => {
          onClose();
          fn && fn();
        };
      }

      return m(
        'div',
        { class: 'fixed inset-0 z-40 bg-black/50 flex flex-col justify-end', onclick: onClose },
        m(
          'div',
          {
            class:
              'bg-white dark:bg-gray-900 rounded-t-2xl shadow-2xl max-h-[85vh] overflow-y-auto',
            onclick: (e) => e.stopPropagation(),
          },
          [
            m('div', { class: 'flex justify-center pt-3 pb-2' }, [
              m('div', { class: 'w-10 h-1 bg-gray-300 dark:bg-gray-600 rounded-full' }),
            ]),
            m('div', { class: 'pb-4' }, [
              m(Item, { label: '← Back', onclick: onClose }),
              m(Item, {
                label: 'Import score',
                sublabel: 'Load score from JSON file',
                onclick: wrap(onImportScore),
              }),
              m(Item, {
                label: 'Import patterns',
                sublabel: 'Add patterns from JSON file',
                onclick: wrap(onImportPatterns),
              }),
            ]),
          ]
        )
      );
    },
  };
}

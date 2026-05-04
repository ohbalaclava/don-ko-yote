import './app.css';
import m from 'mithril';
import { Header } from './components/Header.jsx';
import { Score } from './components/Score.jsx';
import { Palette } from './components/Palette.jsx';

function App() {
  return {
    view() {
      return (
        <div class="flex flex-col h-dvh">
          <img
            src="/mitsudomoe.svg"
            class="fixed inset-0 m-auto w-[70vmin] h-[70vmin] opacity-5 pointer-events-none -z-10"
            aria-hidden="true"
          />
          <Header />
          <Score />
          <Palette />
        </div>
      );
    }
  };
}

m.mount(document.body, App);

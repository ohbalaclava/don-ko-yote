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
          <Header />
          <Score />
          <Palette />
        </div>
      );
    }
  };
}

m.mount(document.body, App);

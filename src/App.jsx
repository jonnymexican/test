import FancyText from './FancyText';
import InspirationGenerator from './InspirationGenerator';
import Copyright from './Copyright';
import './App.css';

export default function App() {
  return (
    <div className="app">
      <FancyText title text="Get Inspired App" />
      <InspirationGenerator>
        <Copyright year={2026} />
      </InspirationGenerator>
    </div>
  );
}
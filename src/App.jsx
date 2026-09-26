import FancyText from './FancyText';
import InspirationGenerator from './InspirationGenerator';
import Copyright from './Copyright';
import ThemeToggle from './ThemeToggle';
import useTheme from './useTheme';
import './App.css';

export default function App() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="app">
      <ThemeToggle theme={theme} onToggle={toggleTheme} />
      <FancyText title text="Get Inspired App" />
      <InspirationGenerator>
        <Copyright year={new Date().getFullYear()} />
      </InspirationGenerator>
    </div>
  );
}
import Canvas from './components/Canvas'
import AppUI from './components/AppUI'

export default function App() {
  return (
    <div className="relative w-screen h-screen overflow-hidden">
      <Canvas />
      <AppUI />
    </div>
  )
}

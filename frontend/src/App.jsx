import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'
import './index.css' 

function App() {
  return (
    <div className="flex flex-col items-center justify-center h-screen bg-gray-100 text-center">
      <div className="flex items-center space-x-4">
        <a href="https://vitejs.dev" target="_blank">
          <img src={viteLogo} className="w-16 h-16 hover:scale-110 transition-transform" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="w-16 h-16 hover:scale-110 transition-transform" alt="React logo" />
        </a>
      </div>

      <p className="mt-6 text-xl text-gray-700 font-medium">
        Click on the Vite and React logos to learn more
      </p>

      <button className="mt-8 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors">
        Tailwind is working 🎉
      </button>
    </div>
  )
}

export default App

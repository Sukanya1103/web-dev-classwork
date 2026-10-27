

function App() {
  let count = 0;
  
  return (
    <>
    <h1>Count: {count}</h1>
      <button onClick={()=> count++}>Increament</button>
      <button onClick={()=> count--}>Decreament</button>
    </>
  )
}

export default App


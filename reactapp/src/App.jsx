function App() {
const Student = [
  {
    id:1,
    name:"Sukanya Rana",
    course: "MCA",
    collage: "KIET"
  },
  {
    id:2,
    name:"Sakshi Singh",
    course: "MCA",
    collage: "KIET"
  },
  {
    id:3,
    name:"Sakshi Rajput",
    course: "MCA",
    collage: "KIET"
  }
]
  return (
    <>
    <h1>Student List</h1>
    {Student.map((student) => (
      <li key={student.id}>{student.name}: {student.course} - {student.collage}</li>
    ))}
    </>
  )
}
export default App

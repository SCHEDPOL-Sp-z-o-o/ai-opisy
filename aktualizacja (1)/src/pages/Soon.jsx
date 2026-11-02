export default function Soon({ title, stage }) {
  return (
    <section className="page">
      <h1>{title}</h1>
      <div className="panel empty">
        <p>Ten moduł powstaje w kolejnym etapie.</p>
        <p className="muted">{stage}</p>
      </div>
    </section>
  )
}

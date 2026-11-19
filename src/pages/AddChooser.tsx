export function AddChooser() {
  return (
    <section>
      <h1>Add a recipe</h1>
      <div className="tiles">
        <a className="tile primary" href="#/new">
          <strong>Type it in</strong>
          <span className="muted">Start from a blank recipe</span>
        </a>
        <a className="tile" href="#/import">
          <strong>Import from Notion</strong>
          <span className="muted">Bring in recipes from a Notion export</span>
        </a>
        <a className="tile" href="#/link">
          <strong>Paste or share a link</strong>
          <span className="muted">Fill in a recipe from a web page</span>
        </a>
        <div className="tile disabled">
          <strong>Scan a book page</strong>
          <span className="muted">Coming in a later step</span>
        </div>
        <div className="tile disabled">
          <strong>Draft with AI</strong>
          <span className="muted">Coming in a later step</span>
        </div>
      </div>
    </section>
  );
}

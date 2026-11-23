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
        <a className="tile" href="#/find">
          <strong>Find a recipe online</strong>
          <span className="muted">Search the web and pick one to bring in</span>
        </a>
        <a className="tile" href="#/link">
          <strong>Paste or share a link</strong>
          <span className="muted">Fill in a recipe from a web page</span>
        </a>
        <a className="tile" href="#/scan">
          <strong>Scan a book page</strong>
          <span className="muted">Take a photo and let AI type it up</span>
        </a>
        <a className="tile" href="#/draft">
          <strong>Draft with AI</strong>
          <span className="muted">Describe a dish and get a first version</span>
        </a>
      </div>
      <p className="muted small">
        <a href="#/settings">Settings</a> (AI on/off, home PC)
      </p>
    </section>
  );
}

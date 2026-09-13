# StreamLens

**Semantics-aware Counterfactual Java Stream Analyzer**

StreamLens is a web-based tool that analyzes Java Stream pipelines, traces elements through each operation, generates counterfactual operation reorderings, and proves whether each reordering preserves the original behavior.

## Core Question

> *"If I reorder these stream operations, will I get the same answer?"*

StreamLens answers it with static reasoning, dynamic testing, and counterexample search — never guessing.

## Features

- **Java Stream Parser** — parses stream pipelines with JavaParser into a structured Intermediate Representation (IR)
- **Pipeline Visualization** — interactive flow graph (React Flow) of source → operations → terminal
- **Execution Tracer** — element-by-element traces: `15 → filter ✓ → map ×2 → 30`
- **Counterfactual Engine** — generates valid alternative operation orderings (filter↔map, filter↔distinct, sorted↔limit, etc.)
- **Semantic Equivalence Engine** — classifies each transformation as:
  - **SAFE**
  - **CONDITIONALLY SAFE**
  - **UNSAFE**
  - **UNKNOWN** *(never a false SAFE)*
- **Counterexample Generator** — finds minimal inputs proving a transformation is unsafe
- **Benchmark Engine** — measures execution time of original vs alternative across multiple datasets
- **Explanation Engine** — Beginner / Developer / Advanced explanations of every result
- **Learning-ready** — foundation for misconception detection and generated exercises

## Design Principle

> **Correctness over aggressive optimization.**

If the system cannot establish equivalence, it returns **UNKNOWN — semantic equivalence could not be proven.** It never claims a transformation is safe without evidence.

## How It Works

```
Original Pipeline
       ↓
Generate Alternative
       ↓
Semantic (Static) Analysis
       ↓
Dynamic Testing (if needed)
       ↓
Compare Results
       ↓
Check Edge Cases
       ↓
SAFE / CONDITIONAL / UNSAFE / UNKNOWN
```

### Example

```java
numbers.stream()
    .filter(n -> n > 10)
    .map(n -> n * 2)
    .toList();
```

StreamLens generates the alternative `map → filter` and determines it is **UNSAFE**, producing a concrete counterexample:

```
Input: [6]

Original (filter → map):  []          (6 rejected)
Alternative (map → filter): [12]      (6 becomes 12, then passes)

Why: map() changes the value filter() evaluates.
```

## Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React, TypeScript, Tailwind CSS, Monaco Editor, React Flow, Framer Motion, Zustand |
| **Backend** | Java 25, Spring Boot 3.4, JavaParser |
| **Analysis** | Custom Stream IR, static semantic analysis, dynamic execution |
| **Infrastructure** | Docker, Docker Compose (backend + frontend + PostgreSQL) |

## Project Structure

```
streamlens/
├── backend/                  # Spring Boot REST API + analysis engines
│   └── src/main/java/com/streamlens/
│       ├── controller/       # REST endpoints
│       ├── service/
│       │   ├── parser/       # JavaParser stream extractor
│       │   ├── ir/           # Stream Intermediate Representation
│       │   ├── engine/       # Counterfactual + Semantic Equivalence + Counterexamples
│       │   ├── tracer/       # Element execution tracer
│       │   ├── benchmark/    # Performance comparison
│       │   └── explanation/  # 3-tier explanations
│       └── model/            # DTOs
├── frontend/                 # React + Vite + Tailwind web app
│   ├── src/
│   │   ├── components/       # editor, pipeline, trace, analysis, benchmark, explanation
│   │   ├── store/            # Zustand state
│   │   ├── services/         # API client
│   │   └── types/            # TypeScript models
│   └── dev-api/              # Node fallback for /api when the JVM backend is down
├── docker-compose.yml        # Backend + frontend + PostgreSQL
└── test-data/                # Sample Java stream snippets
```

## Getting Started

### Prerequisites

- **Java 25** (for the backend)
- **Node.js 18+** (for the frontend)
- **Maven** (to build the backend)
- **Docker** (optional — for the full stack)

### Backend

```bash
cd backend
mvn clean package -DskipTests
java -jar target/streamlens-backend-0.1.0-SNAPSHOT.jar
```

The API starts on `http://localhost:8080`. Health check: `GET /api/health`.

### Frontend

```bash
cd frontend
npm install
npm run dev
```

The app runs on `http://localhost:3000` and proxies `/api` to the backend.

#### Running the frontend without a JVM

`npm run dev` works on its own: if nothing answers on port 8080, Vite serves
`/api/*` from `frontend/dev-api/` — a dependency-free Node port of the analysis
engines (parser, IR, counterfactual generation, semantic equivalence,
counterexample search, tracer, benchmark, explanations) that speaks the same
REST contract as the Spring Boot service. As soon as the real backend is up it
takes over automatically, because the dev server probes `/api/health` first and
proxies to the JVM when it responds.

```bash
npm run dev:api     # run the Node engine standalone on :8080
npm run test:api    # engine tests (parser, int semantics, verdicts, HTTP API)
```

The fallback keeps the project's correctness rule: a lambda it cannot analyse
produces **UNKNOWN**, never a false SAFE.

### Full Stack with Docker

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend | http://localhost:8080 |
| PostgreSQL | localhost:5432 |

## Deployment

### Vercel (frontend)

The repo includes `vercel.json` at the root, which tells Vercel to treat `frontend/` as the project root and build it as a Vite app:

```json
{
  "rootDirectory": "frontend",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite"
}
```

Connect the Vercel project to this GitHub repo (Settings → Git → Connect Git Repository) so every push to `main` auto-deploys. Or deploy manually:

```bash
cd frontend
npx vercel@latest --prod
```

> **Note:** The backend (Spring Boot) is not deployed on Vercel. For the UI's **Analyze** button to work in production, deploy the backend elsewhere (Render, Railway, EC2) and set the `VITE_API_BASE_URL` environment variable to its URL (e.g. `https://your-backend.example.com/api`).

## REST API

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/analyze` | POST | Full end-to-end analysis |
| `/api/parse` | POST | Parse Java code to IR |
| `/api/trace` | POST | Trace elements through pipeline |
| `/api/counterfactual` | POST | Generate alternative pipelines |
| `/api/equivalence` | POST | Check semantic equivalence |
| `/api/counterexample` | POST | Generate counterexample |
| `/api/benchmark` | POST | Benchmark original vs alternative |
| `/api/explain` | POST | Generate multi-level explanations |

All endpoints are implemented by the Spring Boot backend and, identically, by the
Node fallback in `frontend/dev-api/`. `GET /api/health` reports which engine
answered (`"engine": "streamlens-dev-api"` means the fallback is serving).

## Supported Operations

`filter`, `map`, `flatMap`, `sorted`, `distinct`, `limit`, `skip`, `peek`, `reduce`, `collect`, `toList`, `toSet`, `count`, `findFirst`, `findAny`, `anyMatch`, `allMatch`, `noneMatch`, `groupingBy`, `partitioningBy`

Sequential and parallel streams, lazy evaluation, short-circuiting, side-effect detection.

## Roadmap

- [ ] Full theorem-prover for semantic equivalence
- [ ] Docker sandboxed execution of arbitrary user code
- [ ] User accounts, analysis history, and PostgreSQL persistence
- [ ] Learning engine: misconception tracking and generated exercises
- [ ] Broader operation support (reduce, collect, groupingBy, partitioningBy)

## License

MIT
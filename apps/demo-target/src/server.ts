import express from 'express';
import cors from 'cors';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// In-memory data store for testing
let products = [
  { id: 1, name: 'Wireless Headphones', price: 99.99, category: 'Audio' },
  { id: 2, name: 'Mechanical Keyboard', price: 129.50, category: 'Peripherals' },
  { id: 3, name: 'Ultra-Wide Monitor', price: 399.00, category: 'Display' }
];

// --- Web UI Routes (HTML/CSS/JS) ---

app.get('/', (req, res) => {
  res.redirect('/login');
});

app.get('/login', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - Demo Enterprise Portal</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); display: flex; align-items: center; justify-content: center; min-height: 100vh; color: #f8fafc; }
    .card { background: #1e293b; border: 1px solid #334155; padding: 2.5rem; border-radius: 1rem; width: 100%; max-width: 400px; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.5); }
    h1 { font-size: 1.5rem; margin-bottom: 0.5rem; color: #38bdf8; text-align: center; }
    p.sub { text-align: center; color: #94a3b8; font-size: 0.875rem; margin-bottom: 2rem; }
    .form-group { margin-bottom: 1.25rem; }
    label { display: block; font-size: 0.875rem; color: #cbd5e1; margin-bottom: 0.5rem; }
    input[type="text"], input[type="password"] { width: 100%; padding: 0.75rem 1rem; background: #0f172a; border: 1px solid #475569; border-radius: 0.5rem; color: #f8fafc; font-size: 1rem; }
    input:focus { outline: none; border-color: #38bdf8; box-shadow: 0 0 0 3px rgba(56, 189, 248, 0.2); }
    button[type="submit"] { width: 100%; padding: 0.75rem; background: #0284c7; border: none; border-radius: 0.5rem; color: white; font-size: 1rem; font-weight: 600; cursor: pointer; transition: background 0.2s; margin-top: 0.5rem; }
    button[type="submit"]:hover { background: #0369a1; }
    .error-msg { background: rgba(239, 68, 68, 0.2); border: 1px solid #ef4444; color: #fca5a5; padding: 0.75rem; border-radius: 0.5rem; font-size: 0.875rem; margin-bottom: 1rem; display: none; }
  </style>
</head>
<body>
  <div class="card">
    <h1>HRM System</h1>
    <p class="sub">Sign in to access your portal</p>
    <div id="error-alert" class="error-msg" role="alert">Invalid username or password</div>
    <form id="login-form">
      <div class="form-group">
        <label for="username">Username</label>
        <input type="text" id="username" name="username" placeholder="Enter your username" required>
      </div>
      <div class="form-group">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" placeholder="Enter your password" required>
      </div>
      <button type="submit" id="login-btn">Login</button>
    </form>
  </div>
  <script>
    document.getElementById('login-form').addEventListener('submit', function(e) {
      e.preventDefault();
      const u = document.getElementById('username').value.trim();
      const p = document.getElementById('password').value.trim();
      if ((u === 'admin' || u === 'testuser') && (p === 'password123' || p === 'testpass')) {
        sessionStorage.setItem('auth_user', u);
        window.location.href = '/dashboard';
      } else {
        document.getElementById('error-alert').style.display = 'block';
      }
    });
  </script>
</body>
</html>
  `);
});

app.get('/dashboard', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - HRM System</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; min-height: 100vh; }
    header { background: #1e293b; border-bottom: 1px solid #334155; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
    header .logo { font-size: 1.25rem; font-weight: bold; color: #38bdf8; }
    nav a { color: #cbd5e1; text-decoration: none; margin-left: 1.5rem; font-size: 0.95rem; }
    nav a:hover, nav a.active { color: #38bdf8; }
    main { padding: 2rem; max-width: 1200px; margin: 0 auto; }
    .welcome-banner { background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%); padding: 1.5rem 2rem; border-radius: 0.75rem; margin-bottom: 2rem; }
    .welcome-banner h2 { font-size: 1.75rem; margin-bottom: 0.25rem; }
    .stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.5rem; margin-bottom: 2rem; }
    .stat-card { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; }
    .stat-card h3 { font-size: 0.875rem; color: #94a3b8; text-transform: uppercase; margin-bottom: 0.5rem; }
    .stat-card .val { font-size: 2rem; font-weight: bold; color: #f8fafc; }
    .btn-action { background: #38bdf8; color: #0f172a; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; }
    .btn-action:hover { background: #7dd3fc; }
  </style>
</head>
<body>
  <header>
    <div class="logo">HRM System</div>
    <nav>
      <a href="/dashboard" class="active">Dashboard</a>
      <a href="/products">Products</a>
      <a href="/login" id="logout-btn">Logout</a>
    </nav>
  </header>
  <main>
    <div class="welcome-banner">
      <h2>Welcome, Admin User!</h2>
      <p>System is running smoothly. All services operational.</p>
    </div>
    <div class="stats-grid">
      <div class="stat-card" data-testid="stat-users">
        <h3>Total Employees</h3>
        <div class="val">1,248</div>
      </div>
      <div class="stat-card" data-testid="stat-leaves">
        <h3>Pending Requests</h3>
        <div class="val">14</div>
      </div>
      <div class="stat-card" data-testid="stat-payroll">
        <h3>Payroll Processed</h3>
        <div class="val">100%</div>
      </div>
    </div>
    <button class="btn-action" id="create-request-btn">New Request</button>
  </main>
</body>
</html>
  `);
});

app.get('/products', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Products - HRM System</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    body { background: #0f172a; color: #f8fafc; min-height: 100vh; }
    header { background: #1e293b; border-bottom: 1px solid #334155; padding: 1rem 2rem; display: flex; justify-content: space-between; align-items: center; }
    header .logo { font-size: 1.25rem; font-weight: bold; color: #38bdf8; }
    nav a { color: #cbd5e1; text-decoration: none; margin-left: 1.5rem; }
    main { padding: 2rem; max-width: 1200px; margin: 0 auto; }
    .cart-badge { background: #0284c7; padding: 0.25rem 0.75rem; border-radius: 9999px; font-weight: bold; }
    .product-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); gap: 1.5rem; margin-top: 1.5rem; }
    .product-card { background: #1e293b; border: 1px solid #334155; border-radius: 0.75rem; padding: 1.5rem; display: flex; flex-direction: column; justify-content: space-between; }
    .product-card h3 { font-size: 1.25rem; margin-bottom: 0.5rem; color: #38bdf8; }
    .price { font-size: 1.5rem; font-weight: bold; margin: 1rem 0; color: #4ade80; }
    .btn-buy { background: #0284c7; color: white; border: none; padding: 0.6rem 1rem; border-radius: 0.5rem; cursor: pointer; }
    .btn-buy:hover { background: #0369a1; }
  </style>
</head>
<body>
  <header>
    <div class="logo">HRM Store</div>
    <nav>
      <a href="/dashboard">Dashboard</a>
      <a href="/products">Products</a>
      <span>Cart: <span id="cart-count" class="cart-badge">0</span></span>
    </nav>
  </header>
  <main>
    <h2>Equipment Catalog</h2>
    <div class="product-list">
      <div class="product-card">
        <h3>Wireless Headphones</h3>
        <p>Noise cancelling audio</p>
        <div class="price">$99.99</div>
        <button class="btn-buy" id="add-btn-1" onclick="addToCart()">Add to Cart</button>
      </div>
      <div class="product-card">
        <h3>Mechanical Keyboard</h3>
        <p>RGB Backlit keyboard</p>
        <div class="price">$129.50</div>
        <button class="btn-buy" id="add-btn-2" onclick="addToCart()">Add to Cart</button>
      </div>
    </div>
  </main>
  <script>
    let count = 0;
    function addToCart() {
      count++;
      document.getElementById('cart-count').innerText = count;
    }
  </script>
</body>
</html>
  `);
});

// --- REST API Endpoints ---

app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  if ((username === 'admin' || username === 'testuser') && (password === 'password123' || password === 'testpass')) {
    res.json({
      token: 'jwt-demo-token-1234567890abcdef',
      user: {
        id: 1,
        username,
        name: 'Admin User',
        role: 'Administrator'
      }
    });
  } else {
    res.status(401).json({
      error: 'Invalid username or password'
    });
  }
});

app.get('/api/users', (req, res) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.includes('jwt-demo-token')) {
    res.status(401).json({ error: 'Unauthorized: Missing or invalid Bearer token' });
    return;
  }
  res.json([
    { id: 1, name: 'Admin User', role: 'Administrator', email: 'admin@example.com' },
    { id: 2, name: 'Alice Smith', role: 'Tester', email: 'alice@example.com' },
    { id: 3, name: 'Bob Johnson', role: 'Developer', email: 'bob@example.com' }
  ]);
});

app.get('/api/products', (req, res) => {
  res.json(products);
});

app.post('/api/products', (req, res) => {
  const { name, price, category } = req.body;
  if (!name || price === undefined) {
    res.status(400).json({ error: 'Name and price are required' });
    return;
  }
  const newProduct = {
    id: Date.now(),
    name,
    price: Number(price),
    category: category || 'General'
  };
  products.push(newProduct);
  res.status(201).json(newProduct);
});

app.delete('/api/products/:id', (req, res) => {
  const id = Number(req.params.id);
  products = products.filter(p => p.id !== id);
  res.json({ success: true, message: `Product ${id} deleted` });
});

// Swagger / OpenAPI documentation JSON
app.get('/api/docs/swagger.json', (req, res) => {
  res.json({
    openapi: '3.0.0',
    info: {
      title: 'Demo Target API',
      version: '1.0.0',
      description: 'Mock API for Dynamic Auto Testing Platform'
    },
    paths: {
      '/api/health': {
        get: {
          summary: 'Health check',
          responses: { '200': { description: 'Service is healthy' } }
        }
      },
      '/api/auth/login': {
        post: {
          summary: 'User login',
          requestBody: {
            required: true,
            content: { 'application/json': { schema: { type: 'object', properties: { username: { type: 'string' }, password: { type: 'string' } } } } }
          },
          responses: {
            '200': { description: 'Login successful' },
            '401': { description: 'Invalid credentials' }
          }
        }
      },
      '/api/products': {
        get: {
          summary: 'List products',
          responses: { '200': { description: 'List of products' } }
        },
        post: {
          summary: 'Create product',
          responses: { '201': { description: 'Product created' } }
        }
      }
    }
  });
});

app.listen(PORT, () => {
  console.log(`[Demo Target Server] Running at http://localhost:${PORT}`);
});

import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { createAppRoutes } from './router/routes';

const router = createBrowserRouter(createAppRoutes());

function App() {
  return <RouterProvider router={router} />;
}

export default App;

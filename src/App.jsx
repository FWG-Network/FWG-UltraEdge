import { RouterProvider } from 'react-router-dom'; // ឬតាម Router ដែលបងប្រើ
import { router } from './router'; 
import { Providers } from './providers';

function App() {
  return (
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  );
}

export default App;

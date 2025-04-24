import { Routes, Route } from 'react-router-dom';
import RootLayout    from './layouts/RootLayout';
import HomePage      from './pages/HomePage';
import RecipePage    from './pages/RecipePage';
import ListPage      from './pages/ListPage';

export default function App() {
  return (
    <RootLayout>
      <Routes>
        <Route path="/"            element={<HomePage   />} />
        <Route path="/recipe/:id"  element={<RecipePage />} />
        <Route path="/list"        element={<ListPage   />} />
      </Routes>
    </RootLayout>
  );
}


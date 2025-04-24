// RecipePage.jsx
import { useParams } from 'react-router-dom';
export default function RecipePage() {
  const { id } = useParams();
  return <h1 className="text-xl font-bold">Recipe detail for {id}</h1>;
}
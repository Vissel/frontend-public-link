import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';

const api = axios.create({
  baseURL: 'http://localhost:8080/publiclink', // Update with your backend base URL
  // withCredentials: true
});
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});
export default api;

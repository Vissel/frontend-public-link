import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';

const currentHost = `${window.location.protocol}//${window.location.hostname}`;
const localHost = "http://localhost:9080";
const api = axios.create({
  
  baseURL: `${localHost}/publiclink`, // Update with your backend base URL
  // withCredentials: true
});
api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  config.headers['Content-Type']='application/json';
  return config;
});
export default api;

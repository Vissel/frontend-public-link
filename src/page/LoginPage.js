// src/LoginPage.js (updated)
import React, { useState } from 'react';
import { resolvePath, useNavigate } from 'react-router-dom';

import { useAuth, logout } from '../AuthContext'; // Import useAuth
import api from '../api';

const LoginPage = () => {
    const [inputUsername, setInputUsername] = useState('');
    const [inputPassword, setInputPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { login,logout } = useAuth(); // Get the login function from context

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const body = {
                inputUsername: inputUsername,
                inputPassword: inputPassword
            };
            logout();
            const response = await api.post('/auth/login', body);

            if (response.status === 200) {
                console.log('Login successful!');
                login(response.data);
                
                if(response.data.role==='Admin'){
                    navigate('/home'); // Navigate after state is updated
                }else{
                    navigate('/sellerHome',
                        {
                            state:{
                                username:response.data.username
                            }
                        }
                        );
                }
            }else{
                console.error('Login error.');
                setError("You don't have permission to login");
            }
        } catch (err) {
            console.error('Login error:', err);
            if (err.response) {
                if (err.response.data && err.response.data.message) {
                    setError(err.response.data.message);
                } else if (err.response.status === 401 || err.response.status === 403) {
                    setError('Wrong username/password');
                }else {
                    setError('An unexpected error occurred during login.');
                }
            } else if (err.request) {
                setError('No response from server. Please check your network connection.');
            } else {
                setError('Error setting up the login request.');
            }
        }
    };

    const useEffect=()=>{
        console.log('Login page');
    }

    return (
        <div className='container mt-6'>
            <h2>Login</h2>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            <form onSubmit={handleLogin}>
                {/* ... form inputs ... */}
                <div className='row'>
                    <div className='col-sm-1'>
                    <label htmlFor="username">Username:</label></div>
                    <div className='col-sm-2'>
                    <input
                        type="text"
                        id="username"
                        value={inputUsername}
                        onChange={(e) => setInputUsername(e.target.value)}
                        required
                    /></div>
                </div>
                <div className='row'>
                    <div className='col-sm-1'>
                    <label htmlFor="password">Password:</label></div>
                    <div className='col-sm-2'>
                    <input
                        type="password"
                        id="password"
                        value={inputPassword}
                        onChange={(e) => setInputPassword(e.target.value)}
                        required
                    />
                </div></div>
                <button type="submit" className='btn btn-primary'>Log in</button>
            </form>
        </div>
    );
};

export default LoginPage;
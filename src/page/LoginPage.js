// src/LoginPage.js (updated)
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useAuth } from '../AuthContext'; // Import useAuth
import api from '../api';

const LoginPage = () => {
    const [inputUsername, setInputUsername] = useState('');
    const [inputPassword, setInputPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();
    const { login } = useAuth(); // Get the login function from context

    const handleLogin = async (e) => {
        e.preventDefault();
        setError('');

        try {
            const body = {
                inputUsername: inputUsername,
                inputPassword: inputPassword
            };

            const response = await api.post('/auth/login', body, {
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.status === 200) {
                console.log('Login successful!', response.data);
                login(response.data.accessToken);
                navigate('/home'); // Navigate after state is updated
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

    return (
        <div>
            <h2>Login</h2>
            {error && <p style={{ color: 'red' }}>{error}</p>}
            <form onSubmit={handleLogin}>
                {/* ... form inputs ... */}
                <div>
                    <label htmlFor="username">Username:</label>
                    <input
                        type="text"
                        id="username"
                        value={inputUsername}
                        onChange={(e) => setInputUsername(e.target.value)}
                        required
                    />
                </div>
                <div>
                    <label htmlFor="password">Password:</label>
                    <input
                        type="password"
                        id="password"
                        value={inputPassword}
                        onChange={(e) => setInputPassword(e.target.value)}
                        required
                    />
                </div>
                <button type="submit">Log in</button>
            </form>
        </div>
    );
};

export default LoginPage;
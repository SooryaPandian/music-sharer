import { useState, useEffect } from 'react';

export default function ServerStatus({ status, onRetry }) {
    const [elapsedTime, setElapsedTime] = useState(0);

    // Timer for elapsed time
    useEffect(() => {
        if (status === 'checking') {
            const timer = setInterval(() => {
                setElapsedTime(prev => prev + 1);
            }, 1000);

            return () => clearInterval(timer);
        } else {
            setElapsedTime(0);
        }
    }, [status]);

    if (status === 'checking') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-purple-50 to-indigo-100 px-4">
                <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 max-w-md w-full text-center">
                    {/* Animated Spinner */}
                    <div className="mb-6 flex justify-center">
                        <div className="relative w-20 h-20">
                            <div className="absolute inset-0 border-4 border-purple-200 rounded-full"></div>
                            <div className="absolute inset-0 border-4 border-purple-600 rounded-full border-t-transparent animate-spin"></div>
                            <div className="absolute inset-0 flex items-center justify-center text-3xl">
                                🎵
                            </div>
                        </div>
                    </div>

                    {/* Message */}
                    <h2 className="text-2xl font-bold text-gray-800 mb-3">
                        Waking up server...
                    </h2>
                    <p className="text-gray-600 mb-4">
                        The server is starting up. This usually takes 30-50 seconds on the first connection.
                    </p>

                    {/* Elapsed Time */}
                    <div className="bg-purple-50 rounded-lg p-4 mb-4">
                        <p className="text-sm text-gray-600 mb-1">Elapsed time</p>
                        <p className="text-3xl font-bold text-purple-600">
                            {elapsedTime}s
                        </p>
                    </div>

                    {/* Progress indicator */}
                    <div className="w-full bg-gray-200 rounded-full h-2 mb-4">
                        <div
                            className="bg-purple-600 h-2 rounded-full transition-all duration-1000"
                            style={{ width: `${Math.min((elapsedTime / 50) * 100, 100)}%` }}
                        ></div>
                    </div>

                    <p className="text-sm text-gray-500">
                        Please wait while we connect to the server...
                    </p>
                </div>
            </div>
        );
    }

    if (status === 'error') {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 px-4">
                <div className="bg-white rounded-2xl shadow-2xl p-8 md:p-12 max-w-md w-full text-center">
                    {/* Error Icon */}
                    <div className="mb-6 flex justify-center">
                        <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center">
                            <span className="text-5xl">❌</span>
                        </div>
                    </div>

                    {/* Error Message */}
                    <h2 className="text-2xl font-bold text-gray-800 mb-3">
                        Unable to Contact Server
                    </h2>
                    <p className="text-gray-600 mb-6">
                        Sorry, we couldn't connect to the server. This could be due to:
                    </p>

                    {/* Possible reasons */}
                    <ul className="text-left text-sm text-gray-600 mb-6 space-y-2">
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Server is experiencing issues</span>
                        </li>
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>Your internet connection is unstable</span>
                        </li>
                        <li className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>The service might be temporarily down</span>
                        </li>
                    </ul>

                    {/* Retry Button */}
                    <button
                        onClick={onRetry}
                        className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-semibold py-3 px-6 rounded-xl hover:from-purple-700 hover:to-indigo-700 transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105"
                    >
                        🔄 Retry Connection
                    </button>

                    <p className="text-sm text-gray-500 mt-4">
                        Please check your connection and try again
                    </p>
                </div>
            </div>
        );
    }

    return null;
}

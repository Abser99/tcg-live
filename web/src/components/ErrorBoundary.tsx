"use client";

import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0F0F14] text-white flex items-center justify-center">
          <div className="text-center px-6">
            <p className="text-5xl mb-4">⚠️</p>
            <p className="text-xl font-bold mb-2">Algo salió mal</p>
            <p className="text-zinc-500 text-sm mb-6">Recarga la página para intentar de nuevo.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-3 rounded-xl font-bold text-white text-sm"
              style={{ background: "linear-gradient(135deg, #6C3AE8, #8B5CF6)" }}
            >
              Recargar página
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { NeuPanel } from "@/components/ui/neu-panel";

interface Props {
  children: ReactNode;
  componentName: string;
  componentSlug: string;
  resetKey: string;
  onRetry: () => void;
}

interface State {
  error: Error | null;
}

export class DemoErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Album demo failed to render", {
      componentSlug: this.props.componentSlug,
      errorName: error.name,
      hasComponentStack: Boolean(info.componentStack),
    });
  }

  componentDidUpdate(previousProps: Props) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <NeuPanel className="items-start" elevation="inset" role="alert">
        <h3 className="font-semibold text-destructive">演示加载失败</h3>
        <p className="text-sm text-muted-foreground">
          {this.props.componentName} 暂时无法显示。该错误只影响当前组件展示，不会中断目录导航。
        </p>
        <Button className="min-h-11 min-w-11" variant="primary" onClick={this.props.onRetry}>
          重新加载
        </Button>
      </NeuPanel>
    );
  }
}

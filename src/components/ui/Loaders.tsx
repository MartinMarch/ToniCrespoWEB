import { useState, type ImgHTMLAttributes } from "react";

type PageLoaderProps = {
  variant?: "landing" | "grid" | "list" | "biography";
};

type LoadingImageProps = ImgHTMLAttributes<HTMLImageElement> & {
  frameClassName?: string;
};

export function Spinner() {
  return (
    <div className="spinner" aria-hidden="true">
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
      <div />
    </div>
  );
}

export function LoadingImage({ frameClassName, className, onLoad, onError, ...props }: LoadingImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);

  return (
    <span className={`loading-image${isLoaded ? " is-loaded" : ""}${frameClassName ? ` ${frameClassName}` : ""}`}>
      <Spinner />
      <img
        {...props}
        className={className}
        onLoad={(event) => {
          setIsLoaded(true);
          onLoad?.(event);
        }}
        onError={(event) => {
          setIsLoaded(true);
          onError?.(event);
        }}
      />
    </span>
  );
}

export function PageLoader({ variant = "grid" }: PageLoaderProps) {
  const count = variant === "landing" ? 2 : variant === "list" ? 4 : variant === "biography" ? 3 : 6;

  return (
    <div className={`page-loader page-loader--${variant}`} aria-live="polite" aria-busy="true">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="content-skeleton">
          <div className="content-skeleton__media" />
          <div className="content-skeleton__body">
            <div className="content-skeleton__line content-skeleton__line--short" />
            <div className="content-skeleton__line" />
          </div>
        </div>
      ))}
    </div>
  );
}

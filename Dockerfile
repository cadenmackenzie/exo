FROM mcr.microsoft.com/playwright:v1.41.0-jammy

# Install Python and dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Set working directory
WORKDIR /app

# Copy the entire project for installation
COPY . .

# Install the exo package and additional requirements
RUN pip3 install -e .
RUN pip3 install playwright==1.41.0 pillow==10.2.0 selenium==4.17.2

# Install Playwright browsers
RUN python3 -m playwright install chromium

# Expose the port that the API will run on
EXPOSE 52415

# Set environment variable to handle gRPC fork issues
ENV GRPC_ENABLE_FORK_SUPPORT=1
ENV GRPC_POLL_STRATEGY=epoll1

# Run with xvfb for headless browser support
CMD ["xvfb-run", "--server-args=-screen 0 1280x800x24", "exo", "--inference-engine", "mlx"]

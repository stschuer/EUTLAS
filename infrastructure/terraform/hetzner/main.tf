# EUTLAS Infrastructure - Hetzner Cloud
# Terraform configuration for K8s cluster on Hetzner

terraform {
  required_version = ">= 1.0.0"
  
  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.44"
    }
  }

  # Uncomment for remote state
  # backend "s3" {
  #   bucket = "eutlas-terraform-state"
  #   key    = "hetzner/terraform.tfstate"
  #   region = "eu-central-1"
  # }
}

provider "hcloud" {
  token = var.hcloud_token
}

# Variables
variable "hcloud_token" {
  description = "Hetzner Cloud API Token"
  type        = string
  sensitive   = true
}

variable "environment" {
  description = "Environment (dev, staging, prod)"
  type        = string
  default     = "dev"
}

variable "location" {
  description = "Hetzner datacenter location"
  type        = string
  default     = "nbg1" # Nuremberg, Germany
}

variable "k8s_version" {
  description = "Kubernetes version"
  type        = string
  default     = "1.28"
}

# Network
resource "hcloud_network" "eutlas" {
  name     = "eutlas-${var.environment}"
  ip_range = "10.0.0.0/8"
}

resource "hcloud_network_subnet" "k8s" {
  network_id   = hcloud_network.eutlas.id
  type         = "cloud"
  network_zone = "eu-central"
  ip_range     = "10.0.0.0/16"
}

# SSH Key (add your public key)
resource "hcloud_ssh_key" "default" {
  name       = "eutlas-${var.environment}"
  public_key = file("~/.ssh/id_rsa.pub")
}

# Firewall
resource "hcloud_firewall" "k8s" {
  name = "eutlas-k8s-${var.environment}"
  
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "6443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
  
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  # Kubernetes NodePort range (external MongoDB access, NodePort ingress)
  rule {
    direction = "in"
    protocol  = "tcp"
    port      = "30000-32767"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

# Outputs
output "network_id" {
  value = hcloud_network.eutlas.id
}

output "subnet_id" {
  value = hcloud_network_subnet.k8s.id
}





